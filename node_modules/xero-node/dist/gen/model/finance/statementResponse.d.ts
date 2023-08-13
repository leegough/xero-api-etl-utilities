import { StatementLineResponse } from '././statementLineResponse';
export declare class StatementResponse {
    /**
    * Xero Identifier of statement
    */
    'statementId'?: string;
    /**
    * Start date of statement
    */
    'startDate'?: string;
    /**
    * End date of statement
    */
    'endDate'?: string;
    /**
    * Utc date time of when the statement was imported in Xero
    */
    'importedDateTimeUtc'?: Date;
    /**
    * Identifies where the statement data in Xero was sourced, 1) direct bank feed, automatically loaded from the bank (eg STMTIMPORTSRC/CBAFEED); 2) indirect bank feed, automatically loaded from a 3rd party provider (eg STMTIMPORTSRC/YODLEE); 3) manually uploaded bank feed (eg STMTIMPORTSRC/CSV) or 4) manually entered statement data (STMTIMPORTSRC/MANUAL).
    */
    'importSource'?: string;
    /**
    * Opening balance sourced from imported bank statements (if supplied). Note, for manually uploaded statements, this balance is also manual and usually not supplied. Where not supplied, the value will be 0.
    */
    'startBalance'?: number;
    /**
    * Closing balance sourced from imported bank statements (if supplied). Note, for manually uploaded statements, this balance is also manual and usually not supplied. Where not supplied, the value will be 0.
    */
    'endBalance'?: number;
    /**
    * Opening statement balance calculated in Xero (= bank account conversion balance plus sum of imported bank statement lines). Note: If indicative statement balance doesn\'t match imported statement balance for the same date, either the conversion (opening at inception) balance in Xero is wrong or there\'s an error in the bank statement lines in Xero. Ref: https://central.xero.com/s/article/Compare-the-statement-balance-in-Xero-to-your-actual-bank-balance?userregion=true
    */
    'indicativeStartBalance'?: number;
    /**
    * Closing statement balance calculated in Xero (= bank account conversion balance plus sum of imported bank statement lines). Note: If indicative statement balance doesn\'t match imported statement balance for the same date, either the conversion (opening at inception) balance in Xero is wrong or there\'s an error in the bank statement lines in Xero. Ref: https://central.xero.com/s/article/Compare-the-statement-balance-in-Xero-to-your-actual-bank-balance?userregion=true
    */
    'indicativeEndBalance'?: number;
    /**
    * List of statement lines
    */
    'statementLines'?: Array<StatementLineResponse>;
    static discriminator: string | undefined;
    static attributeTypeMap: Array<{
        name: string;
        baseName: string;
        type: string;
    }>;
    static getAttributeTypeMap(): {
        name: string;
        baseName: string;
        type: string;
    }[];
}
