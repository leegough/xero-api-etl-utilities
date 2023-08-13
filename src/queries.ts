import db from "./dbServer"
import { TZ_OFFSET } from "./helpers"
import { ChargesAndPaymentsObj, ChargeWithCustomer } from "./types"

export async function fetchChargesfromDB(xlsxCharges: ChargesAndPaymentsObj[]) {
  const dbCharges = [] as ChargeWithCustomer[]
  const unverifiedCharges = [] as ChargesAndPaymentsObj[]

  if (xlsxCharges.length) {
    for (const charge of xlsxCharges) {
      if (!charge.customerId) continue
      const dbCharge = await db.charge.findFirst({
        where: {
          date: new Date(charge.date.toISOString().slice(0, 10)),
          amount: +charge.amount.toFixed(2),
          customerId: charge.customerId,
          seqNo: charge.seqNo,
        },
        select: {
          id: true,
          amount: true,
          date: true,
          customerId: true,
          customer: {
            select: {
              xeroId: true,
              termsType: true,
              termsDays: true,
            },
          },
          seqNo: true,
          terminalId: true,
          tranTimeStamp: true,
        },
      })

      if (!dbCharge) {
        unverifiedCharges.push(charge)
        continue
      }
      const dbChargeWithNotes = { ...dbCharge, notes: charge.notes }
      dbCharges.push(dbChargeWithNotes)
    }
  }
  return { dbCharges, unverifiedCharges }
}

/**
 * Fetch data from database required to create the DD Xero Invoice for the specified date
 * @param {string | Date} date
 * @returns
 */
export async function fetchDDInvoiceData(date: string | Date) {
  try {
    const curDate = new Date(new Date(date).toISOString().slice(0, 10))
    const [gmTotals, deptSales, storeExpenses, charges, otherPayments] = await Promise.all([
      db.combinedImportedTillTotal.findUniqueOrThrow({
        where: {
          date: curDate,
        },
        select: {
          date: true,
          customerCount: true,
          totalSales: true,
          totalRounding: true,
          totalCash: true,
          totalCheques: true,
          totalEFTPOS: true,
          totalAccountSales: true,
          totalPayoutInstants: true,
          totalPayoutLotto: true,
          totalGst: true,
        },
      }),

      db.departmentSales.findMany({
        where: {
          date: curDate,
        },
        select: {
          deptCode: true,
          department: {
            select: {
              deptDisplayName: true,
              glCodePurchases: true,
              glCodeSales: true,
            },
          },
          sellEx: true,
        },
      }),

      db.charge.findMany({
        where: {
          AND: [{ date: curDate }, { customerId: "10528" }, { tranType: 13 }],
        },
        select: {
          amount: true,
          seqNo: true,
          terminalId: true,
          tranTimeStamp: true,
        },
      }),

      db.charge.findMany({
        where: {
          AND: [{ date: curDate }, { customerId: { not: "10528" } }],
        },
        select: {
          amount: true,
        },
      }),

      db.charge.findMany({
        where: {
          AND: [{ date: curDate }, { customerId: "10528" }, { tranType: 14 }],
        },
        select: {
          amount: true,
        },
      }),
    ])

    const storeExp = {
      totalExp: storeExpenses.reduce((a, c) => a + +c.amount, 0),
      posId: storeExpenses
        .map(
          (v) =>
            `${v.terminalId}/${v.seqNo} - ${new Date(
              (v.tranTimeStamp?.getTime() ?? 0) + TZ_OFFSET ?? Date.now()
            )?.toLocaleString("en-AU", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}\n`
        )
        .join(""),
    }

    const ddTitle = `DD/${gmTotals.date.toLocaleDateString("en-AU", { weekday: "short" }).toLocaleUpperCase()}/${
      gmTotals.customerCount
    }/${(+gmTotals.totalSales / gmTotals.customerCount).toFixed(2)}`

    const totalCustCharges = charges.reduce((a, c) => a + +c.amount, 0)
    const totalOtherPayments = otherPayments.reduce((a, c) => a + +c.amount, 0)

    return { ...gmTotals, storeExp, deptSales, ddTitle, totalCustCharges, totalOtherPayments }
  } catch (error: any) {
    console.error(error?.message ?? JSON.stringify(error))
    await db.$disconnect()
    throw new Error(error?.message ?? JSON.stringify(error))
  }
}