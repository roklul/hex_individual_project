// ATM 轉帳的收款帳號。正式營運時在部署平台設定 ATM_* 環境變數；
// 未設定時使用明確標示「展示用」的假帳號，避免買家誤匯。
export const ATM_ACCOUNT = Object.freeze({
  bankCode: process.env.ATM_BANK_CODE || '000',
  bankName: process.env.ATM_BANK_NAME || '展示銀行',
  account: process.env.ATM_ACCOUNT || '0000-0000-0000',
  accountName: process.env.ATM_ACCOUNT_NAME || 'EMMA 電子零件',
  demo: !process.env.ATM_ACCOUNT,
});

/** ATM 訂單的付款期限（天） */
export const PAYMENT_DEADLINE_DAYS = 3;
