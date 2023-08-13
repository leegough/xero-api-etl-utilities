import { PrismaClient } from "@prisma/client"

export default new PrismaClient({
  errorFormat: "pretty",
  log: ["error"],
  datasources: {
    db: { url: process.argv[2] === "pw" ? process.env.XERO_DB_URL_PW : process.env.XERO_DB_URL_WB },
  },
})