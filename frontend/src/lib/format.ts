const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatInteger(value: number): string {
  return integerFormatter.format(value)
}

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`
}
