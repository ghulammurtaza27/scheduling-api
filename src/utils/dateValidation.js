const isISODateFormat = (value) => {
  if (!value.includes('T')) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
};

const isTimeFormat = (value) => {
  if (!value.includes(':')) return false;
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value);
};

module.exports = {
  isISODateFormat,
  isTimeFormat
}; 