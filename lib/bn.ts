const DIGITS = "০১২৩৪৫৬৭৮৯";

// ইংরেজি সংখ্যা → বাংলা সংখ্যা (৫, ১২)
export function toBn(n: number | string): string {
  return String(n).replace(/\d/g, (d) => DIGITS[Number(d)]);
}
