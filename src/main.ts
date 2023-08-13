import { TokenSet, XeroClient } from "xero-node"
import { refreshTokenSet, sendFileAttachmentsToXero, sendInvOrCRToXero, setActiveTenant } from "./apiFunctions"
import storedToken from "./lib/tokenSet.json"
import { createXeroDataObject } from "./DataObject"
import { getLogPath, getTenantIndex, writeResponseLog } from "./helpers"

async function main(entity: string) {
  try {
    const logPath = getLogPath(entity)
    const tenantIndex = getTenantIndex(entity)

    let xero = new XeroClient()
    const tokenSet: TokenSet = new TokenSet(storedToken)

    xero = await refreshTokenSet(tokenSet)
    const activeTenantId = await setActiveTenant(tenantIndex, xero)

    const { invoices, credits, fileAttachments } = await createXeroDataObject(logPath)
    console.log("Date Objects created")

    const { invRes, crRes } = await sendInvOrCRToXero(invoices, credits, xero, activeTenantId)
    console.log("Date Objects sent to Xero API")


    await writeResponseLog(invRes, crRes, logPath)
    console.log("Xero Invoices created!")

    await sendFileAttachmentsToXero(fileAttachments, xero, activeTenantId, logPath)
    console.log("Attachments uploaded and attached")

    process.exitCode = 0
    return
  } catch (err) {
    console.error(err, null, 2)
    process.exitCode = 1
  }
}

main(process.argv[2])