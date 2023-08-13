import { CreditNotes, Invoices, TokenSet, XeroClient } from "xero-node"
import { writeAttachmentLog, writeTokenSetJson } from "./helpers"
import { FileAttachment, XeroResponseCreateInvoices } from "./types"

const client_id = process.env.XERO_CLIENT_ID ?? ""
const client_secret = process.env.XERO_CLIENT_SECRET ?? ""

/**
 * *Refresh the Xero TokenSet*
 * - Initialises new XeroClient.
 * - Requests tokenSet refresh from Xero.
 * @param {string} userId
 * @returns {Promise<void>} tokenSet
 */
export async function refreshTokenSet(tokenSet: TokenSet) {
  const xero = new XeroClient()
  tokenSet = await xero.refreshWithRefreshToken(client_id, client_secret, tokenSet.refresh_token)
  xero.setTokenSet(tokenSet)

  if (!(await writeTokenSetJson(tokenSet))) {
    console.error("Failed to save the Xero tokenSet to the database")
    throw new Error("Failed to save the Xero tokenSet to the database")
  }

  console.log("Xero tokenSet has been refreshed")
  return xero
}

/**
 * *Set the active tenant*
 * - Sets the active tenant for the XeroClient.
 * - Returns the tenantId.
 * @param {number} index (default: 0)
 * @returns {Promise<string>} tenantId
 */
export async function setActiveTenant(index: number, xero: XeroClient): Promise<string> {
  try {
    const tenants = await xero.updateTenants()
    if (!tenants.length) {
      console.error("Tenant array received from Xero API is empty")
      throw new Error("Tenant array received from Xero API is empty")
    }
    return tenants[index].tenantId
  } catch (error: any) {
    console.error(error?.message ?? JSON.stringify(error))
    throw new Error(error?.message ?? JSON.stringify(error))
  }
}

/**
 * *Send invoices to Xero API*
 * - Sends invoices request to the Xero API.
 * - Returns the response.
 * @param {CreditNotes?} creditData optional
 * @param {Invoices?} invData optional
 * @returns {XeroResponseCreateInvoices} { invRes, crRes }
 */
export async function sendInvOrCRToXero(
  invData: Invoices = { invoices: [] },
  creditData: CreditNotes = { creditNotes: [] },
  xero: XeroClient,
  activeTenantId: string
) {
  try {
    let invRes = {} as XeroResponseCreateInvoices
    let crRes = {} as XeroResponseCreateInvoices

    if (invData.invoices?.length) {
      invRes = await xero.accountingApi.createInvoices(activeTenantId, invData, false, 2)
    }
    if (creditData.creditNotes?.length) {
      crRes = await xero.accountingApi.createCreditNotes(activeTenantId, creditData, false, 2)
    }

    return { invRes, crRes }
  } catch (error: any) {
    console.error(error?.message ?? JSON.stringify(error))
    throw new Error(error?.message ?? JSON.stringify(error))
  }
}

/**
 * *Send file attachments to Xero API*
 * - Looks up the invoiceId for each file attachment.
 * - Sends file attachments request to the Xero API.
 * - Returns the response.
 * @param {FileAttachments} fileAttachments
 * @returns {Promise<XeroResponseCreateInvoices>} { fileRes }
 */
export async function sendFileAttachmentsToXero(
  fileAttachments: FileAttachment[],
  xero: XeroClient,
  activeTenantId: string,
  logPath: string
) {
  try {
    for (const fileAttachment of fileAttachments) {
      const invoiceID = await fetchInvoiceID(fileAttachment.date, xero, activeTenantId)
      if (!invoiceID) {
        console.error("Unable to retrieve an invoiceID for the file attachment.  No file attachment has been uploaded!")
        continue
      }

      const fileRes = await xero.accountingApi.createInvoiceAttachmentByFileName(
        activeTenantId,
        invoiceID,
        fileAttachment.fileName,
        fileAttachment.content
      )

      //TODO - add error checking & logging on Xero response
      await writeAttachmentLog(fileRes, logPath, `fileRes-DD${fileAttachment.date.toISOString().slice(0, 10)}.json`)
      return
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error?.message : JSON.stringify(error, null, 2))
    throw new Error(error instanceof Error ? error?.message : JSON.stringify(error, null, 2))
  }
}

/**
 * *Fetch InvoiceID for DD Invoice from Xero API*
 * - Send request to Xero API to get Invoice details.
 * - Returns the InvoiceID.
 * @param {Date} date
 * @param {XeroClient} xero
 * @param {string} activeTenantId
 * @returns {Promise<string>} invoiceID
 */
export async function fetchInvoiceID(date: Date, xero: XeroClient, activeTenantId: string) {
  const where = `Contact.Name=="Day Dockets"&&DateString=="${date.toISOString().slice(0, 19)}"`
  const invoicesResult = await xero.accountingApi.getInvoices(
    activeTenantId,
    date,
    where,
    undefined,
    undefined,
    undefined,
    undefined,
    ["SUBMITTED"],
    undefined,
    undefined,
    true,
    undefined,
    false
  )

  if (!invoicesResult.body.invoices?.length) {
    console.error(`No invoices found for the file attachment dated ${date.toISOString().slice(0, 10)}`)
    console.error(JSON.stringify(invoicesResult, null, 2))
    return undefined
  }

  if (invoicesResult.body.invoices?.length > 1) {
    console.error(
      `Found more than 1 matching invoice for the file attachment dated ${date
        .toISOString()
        .slice(0, 10)}.  The file attachment has NOT been uploaded!`
    )
    console.error(JSON.stringify(invoicesResult, null, 2))
    return undefined
  }

  const invoiceID = invoicesResult.body.invoices[0]?.invoiceID
  if (!invoiceID) {
    console.error(`No invoiceID found for the file attachment dated ${date.toISOString().slice(0, 10)}`)
    console.error(JSON.stringify(invoicesResult, null, 2))
    return undefined
  }
  return invoiceID
}