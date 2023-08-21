import { CreditNote, CreditNotes, Invoice, Invoices, LineAmountTypes } from "xero-node"
import { fetchDDInvoiceData } from "./queries"
import { TZ_OFFSET, createFileAttachment, getDueDate, verifyCharges } from "./helpers"
import { FileAttachment } from "./types"

export async function DataObject(logPath: string) {
  const { dbCharges, dbCredits, dates, tillVariances } = await verifyCharges(logPath)
  const invoices: Invoices = { invoices: [] }
  const credits: CreditNotes = { creditNotes: [] }
  const fileAttachments: FileAttachment[] = []

  //Get DD Xero Invoice for the day
  for (let i = 0; i < dates.length; i++) {
    const ddInvoice = await createInvoice(dates[i], tillVariances[i])
    invoices.invoices?.push(ddInvoice)
    const fileAttachment = await createFileAttachment(dates[i])
    fileAttachments.push(fileAttachment)
  }

  for (const variant of [dbCharges, dbCredits]) {
    for (const txn of variant) {
      
      const isCredit = +txn?.amount < 0

      // invoice object
      const terms = { termsType: txn?.customer?.termsType, termsDays: txn?.customer?.termsDays }

      const ref = `${txn.terminalId}/${txn.seqNo}`
      const glCode = txn.customerId === "45678" ? "42010" : "41010"
      const desc = `${txn.notes ?? "Customer POS Account Sale"}: \n* POS ID: ${ref}\n* Timestamp: ${new Date(
        (txn.tranTimeStamp?.getTime() ?? 0) + TZ_OFFSET ?? Date.now(),
      )?.toLocaleString("en-AU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}\n* TransactionID: ${txn.id}`
      const dueDate = getDueDate(txn.date, terms)

      if (!(txn?.date && txn?.amount)) {
        console.error("Invoice is missing date or amount: ", JSON.stringify(txn, null, 2))
        continue
      }

      // Create the xero object depending on the type (Invoice or CreditNote)
      if (isCredit) {
        const invOrCN: CreditNote = {
          type: CreditNote.TypeEnum.ACCRECCREDIT,
          contact: {
            contactID: txn.customer?.xeroId,
          },
          date: txn.date.toISOString().slice(0, 10),
          dueDate: dueDate,
          reference: ref,
          status: CreditNote.StatusEnum.SUBMITTED,
          lineAmountTypes: LineAmountTypes.Inclusive,

          lineItems: [
            {
              description: desc,
              quantity: 1,
              unitAmount: Math.abs(+txn.amount),
              taxAmount: 0,
              accountCode: glCode,
              taxType: "EXEMPTOUTPUT",
            },
          ],
        }
        credits.creditNotes?.push(invOrCN)
        continue
      }

      if (!isCredit) {
        const invOrCN: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: {
            contactID: txn.customer?.xeroId,
          },
          date: txn.date.toISOString().slice(0, 10),
          dueDate: dueDate,
          reference: ref,
          status: Invoice.StatusEnum.SUBMITTED,
          lineAmountTypes: LineAmountTypes.Inclusive,

          lineItems: [
            {
              description: desc,
              quantity: 1,
              unitAmount: Math.abs(+txn.amount),
              taxAmount: 0,
              accountCode: glCode,
              taxType: "EXEMPTOUTPUT",
            },
          ],
        }
        invoices.invoices?.push(invOrCN)
        continue
      }
    }
  }
  return { invoices, credits, fileAttachments }
}

/**
 * Create Invoice
 */
export async function createInvoice(date: Date, tillVariance: number) {
  const data = await fetchDDInvoiceData(date)

  const gstSales = +data.totalGst * 11 ?? 0
  const produce = data.deptSales.find((d) => d.department.deptDisplayName === "Fruit & Veg")
  const deli = data.deptSales.find((d) => d.department.deptDisplayName === "Deli")
  const bakery = data.deptSales.find((d) => d.department.deptDisplayName === "Bakery")
  const meat = data.deptSales.find((d) => d.department.deptDisplayName === "Meat")
  const takeaway = data.deptSales.find((d) => d.department.deptDisplayName === "Take-away")
  const cigs = data.deptSales.find((d) => d.department.deptDisplayName === "Cigarettes & Tobacco")
  const instants = data.deptSales.find((d) => d.department.deptDisplayName === "Scratchies")
  const lotto = data.deptSales.find((d) => d.department.deptDisplayName === "Lotto")
  const homeware = data.deptSales.find((d) => d.department.deptDisplayName === "Homeware")
  const depts = [produce, deli, bakery, meat, takeaway, cigs, instants, lotto, homeware]
  const deptsToInclude = depts.filter((d) => d !== undefined)
  const deptSalesLineItems = deptsToInclude.map((d) => ({
    description: `${d?.department.deptDisplayName} Department Sales`,
    quantity: 1,
    unitAmount: +(d?.sellEx ?? 0),
    taxAmount: 0,
    accountCode: d?.department.glCodeSales ?? "41010",
    taxType: "EXEMPTOUTPUT",
  }))
  const freSales =
    +data.totalSales -
    deptsToInclude.reduce((a, c) => a + +(c?.sellEx ?? 0), 0) -
    gstSales -
    (+data.totalAccountSales - data.storeExp.totalExp) +
    data.totalOtherPayments //totalOtherPayments will be negative that's why we add it
  const rounding = +(data.totalRounding ?? 0) * -1

  const ddInv: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact: {
      contactID: process.argv[2] === "pw" ? process.env.XERO_DD_CONTACT_ID_PW : process.env.XERO_DD_CONTACT_ID_WB,
    },
    date: date.toISOString().slice(0, 10),
    dueDate: new Date(date.getTime() + 86400000 * 2).toISOString().slice(0, 10),
    reference: data.ddTitle,
    status: Invoice.StatusEnum.SUBMITTED,
    lineAmountTypes: LineAmountTypes.Inclusive,

    lineItems: [
      {
        description: "Tape Sales Taxable (GST)",
        quantity: 1,
        unitAmount: gstSales,
        taxAmount: +data.totalGst ?? 0,
        accountCode: "41010",
        taxType: "OUTPUT",
      },
      {
        description: "Tape Sales Non-Taxable (FRE)",
        quantity: 1,
        unitAmount: freSales,
        taxAmount: 0,
        accountCode: "41010",
        taxType: "EXEMPTOUTPUT",
      },
      ...deptSalesLineItems,
      {
        description: "Rounding from POS",
        quantity: 1,
        unitAmount: rounding,
        taxAmount: 0,
        accountCode: "62650",
        taxType: "BASEXCLUDED",
      },
      {
        description: `In-Store Use Expenses/COGS:\n${data.storeExp.posId}`,
        quantity: 1,
        unitAmount: +(data.storeExp.totalExp ?? 0) * -1,
        taxAmount: 0,
        accountCode: process.argv[2] === "wb" ? "51310" : "51130",
        taxType: "EXEMPTEXPENSES",
      },
    ],
  }

  return ddInv
}