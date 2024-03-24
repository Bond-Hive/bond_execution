const calculateBondPrice = (couponRate, faceValue, yieldRate, daysToExpiry) => {
  const daysInYear = 365;
  const dailyCouponRate = couponRate / daysInYear;
  const dailyCouponPayment = dailyCouponRate * faceValue;
  const dailyYieldRate = yieldRate / daysInYear;

  let totalPresentValueCoupons = 0;
  for (let day = 1; day <= daysToExpiry; day++) {
    const presentValueCoupon = dailyCouponPayment / Math.pow(1 + dailyYieldRate, day);
    totalPresentValueCoupons += presentValueCoupon;
  }

  const presentValueFaceValue = faceValue / Math.pow(1 + dailyYieldRate, daysToExpiry);
  const bondPrice = totalPresentValueCoupons + presentValueFaceValue;

  return bondPrice;
};

const calculateNumberOfBondsIssuedWithCoupon = (investmentAmount, couponRate, faceValue, yieldRate, daysToExpiry) => {
  const bondPrice = calculateBondPrice(couponRate, faceValue, yieldRate, daysToExpiry);
  const numberOfBondsIssued = investmentAmount / bondPrice;
  return numberOfBondsIssued;
};


const calculateZeroCouponBondPrice = (faceValue, yieldRate, daysToExpiry) => {
  const daysInYear = 365;
  const dailyYieldRate = yieldRate / daysInYear;
  const bondPrice = faceValue / Math.pow(1 + dailyYieldRate, daysToExpiry);

  return bondPrice;
};

const calculateNumberOfBondsIssued = (investmentAmount, faceValue, yieldRate, daysToExpiry) => {
  const bondPrice = calculateZeroCouponBondPrice(faceValue, yieldRate, daysToExpiry);
  const numberOfBondsIssued = investmentAmount / bondPrice;
  return numberOfBondsIssued;
};

// Example usage:
const investmentAmount = 5000; // Input --> This comes to the SC from investor input
const couponRate = 0.15; // Standard: 15% annual coupon rate, this is randomly chosen, can be any value and is set at the begining of the opening of pool
const faceValue = 100; // Face value of each bond, this is standard for all bonds
const yieldRate = 0.22; // Standard: Input --> 22% annual yield, this comes as input after we enter position on binance, I will create this module
const daysToExpiry = 26; // Automatic: This is based on the time to issue, can be automatically calculated

const numberOfCouponBonds = calculateNumberOfBondsIssuedWithCoupon(investmentAmount, couponRate, faceValue, yieldRate, daysToExpiry);
console.log(`Number of coupon-paying bonds issued: ${numberOfCouponBonds.toFixed(6)}`);

const numberOfZeroCouponBonds = calculateNumberOfBondsIssued(investmentAmount, faceValue, yieldRate, daysToExpiry);
console.log(`Number of zero-coupon bonds issued: ${numberOfZeroCouponBonds.toFixed(6)}`);
