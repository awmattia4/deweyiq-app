/**
 * Minimal type declarations for node-quickbooks.
 *
 * node-quickbooks does not ship with TypeScript types. These declarations
 * cover only the methods we use for QBO sync.
 */
declare module "node-quickbooks" {
  interface QboCallback<T = any> {
    (err: any, result: T): void
  }

  class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      token: string,
      tokenSecret: boolean | string,
      realmId: string,
      useSandbox: boolean,
      enableDebug: boolean,
      minorversion: number | null,
      oauthversion: string,
      refreshToken: string
    )

    createCustomer(customer: any, callback: QboCallback): void
    updateCustomer(customer: any, callback: QboCallback): void
    getCustomer(id: string, callback: QboCallback): void
    findCustomers(criteria: any, callback: QboCallback): void

    createInvoice(invoice: any, callback: QboCallback): void
    updateInvoice(invoice: any, callback: QboCallback): void
    getInvoice(id: string, callback: QboCallback): void
    findInvoices(criteria: any, callback: QboCallback): void

    createPayment(payment: any, callback: QboCallback): void
    getPayment(id: string, callback: QboCallback): void
    findPayments(criteria: any, callback: QboCallback): void
  }

  export = QuickBooks
}

declare module "intuit-oauth" {
  interface TokenResponse {
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
    x_refresh_token_expires_in: number
    createdAt: number
    realmId: string
  }

  interface AuthResponse {
    token: TokenResponse
    response: any
    body: string
    json: any
    intuit_tid: string
  }

  class OAuthClient {
    constructor(config: {
      clientId: string
      clientSecret: string
      environment: "sandbox" | "production"
      redirectUri: string
    })

    authorizeUri(params: {
      scope: string | string[]
      state: string
    }): string

    createToken(uri: string): Promise<AuthResponse>

    refreshUsingToken(refreshToken: string): Promise<AuthResponse>

    getToken(): TokenResponse

    setToken(token: Partial<TokenResponse>): void

    static scopes: {
      Accounting: string
      Payment: string
      Payroll: string
      TimeTracking: string
      Benefits: string
      Profile: string
      Email: string
      Phone: string
      Address: string
      OpenId: string
    }
  }

  export = OAuthClient
}
