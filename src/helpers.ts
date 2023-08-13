import { constants, createReadStream, promises, writeFileSync } from "fs"
import { TokenSet } from "xero-node"
import { fetchChargesfromDB } from "./queries"
import { parseXlsxFiles } from "./parse"
import {
  ChargesAndPaymentsObjArrOBJ,
  TradingTerms,
  XeroResponseCreateAttachments,
  XeroResponseCreateInvoices,
} from "./types"

const logName = new Date().toISOString().slice(0, 10)
const TZ = process.env?.TZ ? +process.env.TZ : 10

/**
 * Returns the path of the directory to storelog files for the given entity
 * @param {string} entity - The entity for which to return the log path
 * @returns {string} - The path of the directory to store log files for the given entity
 */
export function getLogPath(entity: string): string {
  switch (entity) {
    case "pw":
      if (!process.env?.RF_DD_IMPORT_LOG_PATH_PITTSWORTH) break
      return process.env?.RF_DD_IMPORT_LOG_PATH_PITTSWORTH
    case "wb":
      if (!process.env?.RF_DD_IMPORT_LOG_PATH_WESTBROOK) break
      return process.env?.RF_DD_IMPORT_LOG_PATH_WESTBROOK
    default:
      console.error("Invalid or null entity value provided or environment variable has not been set")
      break
  }
  throw new Error("Invalid or null entity value provided or environment variable has not been set")
}

export function getTenantIndex(entity: string) {
  switch (entity) {
    case "pw":
      return 1
    case "wb":
      return 0
    default:
      console.error("No Xero tenant exists for the provided entity value")
      break
  }
  throw new Error("No Xero tenant exists for the provided entity value")
}

/**
 * *|| CHECK IF LOG FILE ALREADY EXISTS ||*
 * Checks if a log file already exists and returns a new file name if it does
 * @param {string} logFile - The path of the log file to check
 * @param {number} attempt - The number of times the function has been called recursively
 * @returns {Promise<string>} - The path of the log file to write to
 */
export async function alreadyExistsLogFile(logFile: string, attempt = 0): Promise<string> {
  const doesExist = await promises
    .access(logFile, constants.F_OK)
    .then(() => true)
    .catch(() => false)
  return doesExist
    ? await alreadyExistsLogFile(
        logFile.replace(/(?<=\d{4}-\d{2}-\d{2}).*\.json/, `${String.fromCharCode(++attempt + 96)}.json`),
        attempt
      )
    : logFile
}

/**
 * *|| CREATE FILE ATTACHMENT OBJECT OF EXCEL DD FILE ||*
 * Creates a file attachment object for the Xero API from the excel file
 * @param {string} filePath - The path of the excel file to create the file attachment object from
 * @returns {Promise<{ fileName: string; mimeType: string; content: string }>} - The file attachment object
 */
export async function createFileAttachment(date: Date) {
  if (!process.env?.XERO_INPUT_PATH) throw new Error("XERO_INPUT_PATH environment variable is not set")
  const fileName = `DD ${date.getDate().toString().padStart(2, "0")}.xls`
  const filePath = process.env.XERO_INPUT_PATH
  const file = createReadStream(`${filePath}/${fileName}`)
  return { date, fileName, content: file, mimeType: "application/vnd.ms-excel" }
}

/**
 * *|| FILE WRITES ||*
 * Writes the response from the Xero API to a log file
 * @param {XeroResponseCreateInvoices} invRes - The response from the Xero API for the invoiceData
 * @param {XeroResponseCreateInvoices} crRes - The response from the Xero API for the creditData
 * @param {string} logPath - The path of the directory to store log files for the given entity
 * @returns {Promise<void>}
 */
export async function writeResponseLog(
  invRes: XeroResponseCreateInvoices,
  crRes: XeroResponseCreateInvoices,
  logPath: string
) {
  for (const res of [invRes, crRes]) {
    if (res) {
      const fileName = alreadyExistsLogFile(`${logPath}/res-${logName}.json`)
      writeFileSync(await fileName, JSON.stringify(res, null, 2))
    }
    return
  }
}

/**
 * *|| FILE WRITES ||*
 * Writes the response for Create Invoice File Attachments from the Xero API to a log file
 * @param {XeroResponseCreateAttachments} fileRes - The response from the Xero API for the invoiceData
 * @param {string} logPath - The path of the directory to store log files for the given entity
 * @returns {Promise<void>}
 */
export async function writeAttachmentLog(
  fileRes: XeroResponseCreateAttachments,
  logPath: string,
  initFileName: string
) {
  const fileName = alreadyExistsLogFile(`${logPath}/${initFileName}`)
  writeFileSync(await fileName, JSON.stringify(fileRes, null, 2))
  return
}

/**
 * *|| FILE WRITES ||*
 * Saves Xero API TokenSet to a JSON file
 * @param {TokenSet} tokenSet - A valid Xero API TokenSet
 * @param {string} jsonPath - The path for storing the tokenSet JSON
 * @returns {Promise<boolean>}
 */
export async function writeTokenSetJson(tokenSet: TokenSet, jsonPath = process.env.XERO_TOKEN_SET_PATH ?? null) {
  try {
    if (
      !tokenSet ||
      !tokenSet.id_token ||
      !tokenSet.access_token ||
      !tokenSet.expires_in ||
      !tokenSet.refresh_token ||
      !tokenSet.scope
    ) {
      console.error("TokenSet is missing required fields")
      throw new Error("TokenSet is missing required fields")
    }
    if (!jsonPath) {
      console.error("XERO_TOKEN_SET_PATH environment variable has not been set")
      throw new Error("XERO_TOKEN_SET_PATH environment variable has not been set")
    }
    writeFileSync(jsonPath, JSON.stringify(tokenSet, null, 2))
    return true
  } catch (error: any) {
    console.error(JSON.stringify(error?.message ?? error, null, 2))
    throw new Error(JSON.stringify(error?.message ?? error, null, 2))
  }
}

/**
 * *|| FILE WRITES ||*
 * - Writes json stringified parsed xlsx data to log file
 * @param {ChargesAndPaymentsObjArrOBJ[]} data - The parsed xlsx data
 * @param {string} logPath - The path of the directory to store log files for the given entity
 * @returns {Promise<void>}
 */
export async function writeRequestLog(data: ChargesAndPaymentsObjArrOBJ[], logPath: string) {
  if (data.length) {
    const fileName = alreadyExistsLogFile(`${logPath}/req-${logName}.json`)
    writeFileSync(await fileName, JSON.stringify(data, null, 2))
    console.log("XLSX data written to JSON invoiceData file.")
  }
  return
}

/**
 * *|| BASIC CHECKS ||*
 * - Verifies that the charges in the xlsx file match the charges in the database
 * - Verifies that the importable charges from the xlsx file are balanced with db charges
 * @param {ChargesAndPaymentsObjArrOBJ[]} importedCharges - The parsed xlsx data
 * @param {ChargeWithCustomer[]} dbCharges - The charges from the database
 * @param {ChargeWithCustomer[]} unverifiedCharges - The charges that were not found in the database
 * @returns {void}
 */
export async function verifyCharges(logPath: string) {
  const { data: importedDays, dates, tillVariances } = parseXlsxFiles(logPath)

  const xlsxCharges = importedDays.map((day) => day.accountSales).flat()
  const xlsxCredits = importedDays.map((day) => day.accountCR).flat()
  const { dbCharges, unverifiedCharges } = await fetchChargesfromDB(xlsxCharges)
  console.log("Charges for verification fetched from DB")
  const { dbCharges: dbCredits, unverifiedCharges: unverifiedCredits } = await fetchChargesfromDB(xlsxCredits)
  console.log("Credits for verification fetched from DB")

  if (!importedDays.every((day) => day.isBalanced)) {
    console.warn(
      "\n",
      "*".repeat(80),
      "\n",
      'WARN: Charges & credits to import DO NOT reconcile with Total Debtors from the DD.  Manually review "For Approval"\'s in Xero before posting as "Approved"!!!',
      "\n",
      "*".repeat(80),
      "\n"
    )
  }

  if (unverifiedCharges.length) {
    console.warn("\n", "*".repeat(80), "\n", "The following charges require corrections prior to importing:")
    for (const charge of unverifiedCharges) {
      console.warn(`\nCharge not matched in DB: ${JSON.stringify(charge, null, 2)}`, "\n\n", "*".repeat(80), "\n")
    }
  }
  if (unverifiedCredits.length) {
    console.warn("\n", "*".repeat(80), "\n", "The following credit notes require corrections prior to importing:")
    for (const charge of unverifiedCredits) {
      console.warn(`\nCredit note not matched in DB: ${JSON.stringify(charge, null, 2)}`, "\n\n", "*".repeat(80), "\n")
    }
  }
  if (unverifiedCharges.length || unverifiedCredits.length) {
    throw new Error("NOTHING IMPORTED TO Xero, check transactionsabove before attempting to import again.")
  }
  return { dbCharges, dbCredits, dates, tillVariances }
}

/**
 * Generates the due date required for the Xero Data object
 * Use terms from database to determine due date, defaulting to
 * end of month after end of month (EOM after EOM) if no terms are set
 * @param {Date | string} curDate - The date of the transaction requiring a due date
 * @param {TradingTerms} terms - The terms from the database
 * @returns {string} The due date in ISO format
 * @eg `2023-01-31`
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getDueDate(curDate: Date | string, terms: TradingTerms) {
  const date = new Date(curDate)
  let month = date.getMonth()
  let year = date.getFullYear()
  let day = date.getDate()

  if (terms?.termsType === "DAYSAFTERBILLDATE") {
    day += terms.termsDays
  }

  if (terms?.termsType === "OFFOLLOWINGMONTH") {
    day = terms.termsDays
    month++
    if (month > 11) {
      year++
      month = 0
    }
  }

  // If terms are not set, set due date to EOM after EOM
  if (terms === null) {
    day = 0
    month++
    if (month > 11) {
      year++
      month = 0
    }
    month++
  }

  return new Date(year, month, day, Math.trunc(TZ), (TZ % 1) * 60, 0, 0).toISOString().slice(0, 10)
}

/** Timezone hours in milliseconds */
export const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000