import type { Charge, Customer, TermsType } from "@prisma/client"
import type { ReadStream } from "fs"
import type { IncomingMessage } from "http"
import type { Attachments, CreditNote, CreditNotes, Invoice, Invoices, TokenSet, XeroClient } from "xero-node"

/** Charges & Payments Data Object contains all Charges & Payments data for a single day */
export type ChargesAndPaymentsObj = {
  date: Date
  amount: number
  customerId: string | null
  seqNo: string
  notes: string
}

/** Object of ChargesAndPaymentsObj Array Objects */
export type ChargesAndPaymentsObjArrOBJ = {
  accountSales: ChargesAndPaymentsObj[]
  accountCR: ChargesAndPaymentsObj[]
  totalDebtors: number
  isBalanced: boolean
  accountPayments?: ChargesAndPaymentsObj[]
}

/** Object of Charge including Customer from Prisma */
export type ChargeWithCustomer = Partial<Charge> & { customer: Pick<Customer, "xeroId" | "termsType" | "termsDays"> }

/** Transaction Type for node-xero API */
export type InvoiceType<T> = T extends CreditNote ? CreditNote : Invoice

/** sendToXero Invoices and/or CreditNotes Promise array functions Type */
export type SendToXero =
  | typeof XeroClient.prototype.accountingApi.createInvoices
  | typeof XeroClient.prototype.accountingApi.createCreditNotes

/** sendToXero Invoices and/or CreditNotes Promise array return Type */
export type XeroResponseCreateInvoices = {
  response: Partial<IncomingMessage>
  body: Invoices | CreditNotes
}

/** sendToXero File Attachments Promise array return Type */
export type XeroResponseCreateAttachments = {
  response: Partial<IncomingMessage>
  body: Attachments
}

/** Parsed xlsx data object */
export type ParsedXlsxData = {
  accountSales: ChargesAndPaymentsObj[]
  accountCR: ChargesAndPaymentsObj[]
  totalDebtors: number
  isBalanced: boolean
}

/** Xero tokenSet as returned from  database Store */
export type ValidTokenSet = Omit<TokenSet, keyof "expired" & keyof "claims">

/** Declaration of Xero storedTokenSet JSON module for saving current tokenSet data*/
declare module "resources/tokenSet.json" {
  const tokenSet: ValidTokenSet
  export default tokenSet
}

/** Account trading terms from database store */
export type TradingTerms = { termsType: TermsType; termsDays: number } | null

/** Xero Accounting API File Attachment Object */
export type FileAttachment = { date: Date; fileName: string; content: ReadStream; mimeType: string }