import { assert } from "chai"
import tzMock from "timezone-mock"

/**
 * This test suite is to test the TZ_OFFSET constant
 * TZ_OFFSET is used to adjust the date to the correct UTC value when querying
 * the database.
 * The TZ_OFFSET function is not imported, but hardcoded into each test so the
 * mocked time zone is used for the test.  If the const is imported, it will
 * instantiate the const with the current time zone, which will not be the
 * mocked time zone.
 */
describe("TZ_OFFSET should return the correct time zone offset in ms", () => {
  it("should return 0 for UTC", () => {
    tzMock.register("UTC")
    const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000
    assert.strictEqual(TZ_OFFSET, 0)
  })

  it("should return 36000000 for UTC+10", () => {
    tzMock.register("Etc/GMT-10")
    const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000
    assert.strictEqual(TZ_OFFSET, -36000000)
  })

  it("should return -36000000 for UTC-10", () => {
    tzMock.register("Etc/GMT+10")
    const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000
    assert.strictEqual(TZ_OFFSET, 36000000)
  })

  it("should work if time zone is not an integer number of hours", () => {
    tzMock.register("Australia/Adelaide")
    const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000
    assert.strictEqual(TZ_OFFSET, -34200000)
  })
})

describe("TZ_OFFSET should adjust date to expected return value", () => {
  it("should return the date string as UTC value of local date", () => {
    tzMock.unregister()
    const TZ_OFFSET = new Date().getTimezoneOffset() * 60 * 1000
    // capture the current date local date & time in UTC
    const jsDate = Date.now()
    // create a new local date object adjusted by TZ difference from the captured date
    const date = new Date(jsDate + TZ_OFFSET)
    // convert the local date object to ISO string and compare to the captured date ISO string
    // the two should be the exact same value
    assert.strictEqual(new Date(date.getTime() - TZ_OFFSET).toISOString(), new Date(jsDate).toISOString())
  })
})