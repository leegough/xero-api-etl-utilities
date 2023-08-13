import { lstatSync, readdirSync } from "fs"
import { join } from "path"
import type { WorkBook, WorkSheet } from "xlsx"
import { readFile } from "xlsx"
import { writeRequestLog } from "./helpers"
import { ChargesAndPaymentsObj, ParsedXlsxData } from "./types"

/**
 * Extract Excel Day Docket customer charge data from Excel sheets
 */
export function parseXlsxFiles(logPath: string) {
  if (!process.env.XERO_INPUT_PATH) throw new Error("XERO_INPUT_PATH environment variable is not set")

  const files = getDDFiles(process.env.XERO_INPUT_PATH)
  if (!files.length) throw new Error("No importable files found in the import directory")

  const data: ParsedXlsxData[] = []
  const dates: Date[] = []
  const tillVariances: number[] = []

  for (const file of files) {
    const wb: WorkBook = readFile(file)
    const { chargesAndPaymentsData, date, tillVariance } = fetchSummaryData(wb)

    data.push(chargesAndPaymentsData)
    dates.push(date)
    tillVariances.push(tillVariance)
  }
  writeRequestLog(data, logPath)
  return { data, dates, tillVariances }
}

/**
 * Recurse input directory to create an array of file paths to process.
 * Files are matched based on the filename being consistent with a Day Docket file.
 * @param {string} dir file path to begin recursive search
 * @returns {string[]} string[] of valid file paths to process
 */
function getDDFiles(dir: string) {
  const ddFileList = [] as string[]
  const files = readdirSync(dir)

  for (const file of files) {
    const filePath = join(dir, file)
    const fileStat = lstatSync(filePath)
    if (fileStat.isDirectory()) {
      getDDFiles(filePath)
    }
    if (fileStat.isFile() && /^DD \d\d\.xls[x]?$/.test(filePath.split("/").slice(-1)[0])) {
      ddFileList.push(filePath)
    }
  }
  return ddFileList
}

/**
 * *Get data from A4 Summary Worksheet*
 * @param {WorkBook} wb XLSX (SheetJS) workbook buffer read
 * @returns {ChargesAndPaymentsObjArrOBJ} An object of Charges & Payments Data object arrays
 */
function fetchSummaryData(wb: WorkBook) {
  // set worksheet
  const ws = wb.Sheets["A4 Summary"]
  const date = new Date(Date.UTC(0, 0, ws.B3.v - 1))
  const tillVariance: number = ws?.D15?.v ?? 0

  const chargesAndPaymentsData = summaryChargesAndPayments(ws)
  return { chargesAndPaymentsData, date, tillVariance }
}

/**
 * Get Charges & Payments Data from A4 Summary worksheet per day
 * @param {WorkSheet} ws XLSX (SheetJS) worksheet buffer read
 * @returns {ChargesAndPaymentsObjArrOBJ} An object of Charges & Payments Data object arrays
 */
function summaryChargesAndPayments(ws: WorkSheet) {
  let accountSales = [] as ChargesAndPaymentsObj[]
  let accountCR = [] as ChargesAndPaymentsObj[]
  let accountPayments = [] as ChargesAndPaymentsObj[]
  let i = 21
  let triggerCount = 0
  for (i; triggerCount < 2; i++) {
    const charge = {
      date: new Date(Date.UTC(0, 0, ws.B3.v - 1)),
      amount: ws?.[`C${i}`]?.v ?? 0,
      customerId:
        ws?.[`C${i}`]?.v && ws?.[`D${i}`]?.v
          ? /-/.test(ws?.[`D${i}`]?.v)
            ? `${ws?.[`D${i}`]?.v.replace(/-/, "")}`
            : `${ws?.[`D${i}`]?.v}`
          : ws?.[`C${i}`]?.v
          ? "10528"
          : null,
      seqNo: `0000${ws?.[`E${i}`]?.v}`?.slice(-4) ?? null,
      notes: ws?.[`F${i}`]?.v ?? null,
    } /* as import("../../types.js").ChargesAndPaymentsObj */
    if (charge.amount === "Amount") {
      triggerCount++
    }

    // Adding triggerCount === 1 so store charges aren't included.
    // This is temporary while I get customer charges importing OK.
    if ((!charge.amount && !charge.customerId && !charge.seqNo && !charge.notes) || triggerCount === 0) {
      continue
    }
    if (charge.amount !== "Amount" && Math.abs(+charge.amount.toFixed(2)) !== 0) {
      // Seperate Credit Notes from Charges
      if (charge.amount < 0) {
        accountCR = [...accountCR, charge]
        continue
      }
      accountSales = [...accountSales, charge]
    }
  }

  i++
  do {
    const payment = {
      date: new Date(Date.UTC(0, 0, ws.B3.v - 1)),
      amount: Math.abs(ws?.[`C${i}`]?.v ?? 0),
      customerId: ws?.[`D${i}`]?.v ?? null,
      seqNo: ws?.[`E${i}`]?.v ?? null,
      notes: ws?.[`F${i}`]?.v ?? null,
    } /* as import("../../types.js").ChargesAndPaymentsObj */
    i++
    if (!payment.amount && !payment.customerId && !payment.seqNo && !payment.notes) {
      continue
    }
    if (payment.customerId !== "Total Charges") {
      accountPayments = [...accountPayments, payment]
    }
  } while (ws?.[`D${i}`]?.v !== "Total Charges")

  // Get Total Debtors
  const row = +(Object.keys(ws).find((key) => ws[key]?.v === "Total Debtors") ?? "0").replace(/\D/g, "")
  const totalDebtors: number = ws?.[`G${row}`]?.v ?? 0

  // Verify total debtors sums to correct amount
  const isBalanced =
    [...accountSales.map((charge) => charge.amount), ...accountCR.map((charge) => charge.amount)].reduce(
      (a, c) => a + c,
      0
    ) === totalDebtors

  return { accountSales, accountCR, totalDebtors, isBalanced }
}