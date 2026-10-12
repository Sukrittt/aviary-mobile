import { IncomeForm } from "./add-income";

/** One-off income on the green flood. Log-expense's income button fills the
 * screen green from where it sits and lands here; the nav's quick-add menu
 * fades straight in. Its own route so it can fade in over a green backdrop
 * instead of sliding up as a modal like add-income. */
export default function QuickIncomeModal() {
  return <IncomeForm flood />;
}
