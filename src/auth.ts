import { XeroClient } from "xero-node/dist/XeroClient"
import { writeTokenSetJson } from "./helpers"

newAuth()

/**
 * Gets a new tokenSet from Xero API and saves it to the database.
 * Required for authorises new Organisations to use the app.
 * @param {string} userId
 * @returns {Promise<void>}
 * @notes Seperate function only required initially or to authorise new Organisations.
 */
async function newAuth() {
  const client_id = process.env.XERO_CLIENT_ID ?? ""
  const client_secret = process.env.XERO_CLIENT_SECRET ?? ""
  const redirectUris = [process.env.XERO_REDIRECT_URI ?? ""]
  const scopes = (process.env.XERO_SCOPES ?? "").split(" ")

  // Initialize the XeroClient and build the consent url
  const xero = new XeroClient({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUris,
    scopes,
  })
  await xero.initialize()
  const consentUrl = await xero.buildConsentUrl()
  console.log(consentUrl)

  // Open the consent url in the user's browser
  import("open").then((open) => open.default(consentUrl))

  // Create a readline interface to get the callback url from the user
  const rl = Readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return
}