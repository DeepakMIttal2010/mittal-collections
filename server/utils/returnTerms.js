// The return terms of one order line: whether it can be returned and the
// window in days from delivery. The terms saved on the line at checkout
// win (the returns policy applies the terms "at the time of purchase");
// a line saved before they existed reads the product as it is now, the
// product's own window else the site default, as before.
//
// `product` is the current product (null when it no longer exists); with
// no saved terms, a missing product counts as returnable, and each caller
// decides as before what a missing product means for it.
export const lineReturnTerms = (item, product, defaultDays) => {
  const savedDays = Number(item?.returnPeriodDays);
  if (typeof item?.isReturnable === "boolean" && Number.isInteger(savedDays) && savedDays > 0) {
    return { isReturnable: item.isReturnable, periodDays: savedDays };
  }
  return {
    isReturnable: product ? product.isReturnable !== false : true,
    periodDays: product?.returnPeriodDays || defaultDays,
  };
};
