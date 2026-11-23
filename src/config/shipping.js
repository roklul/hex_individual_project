export const FREE_SHIPPING_THRESHOLD = 500;
export const SHIPPING_FEE = 60;

export const calcShipping = (subtotal) => (subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE);
