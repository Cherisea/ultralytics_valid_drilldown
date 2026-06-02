import { redirect } from "next/navigation";

/** Prototype has one fixture run; replace with real run discovery in production. */
const DEFAULT_RUN_ID = "run-24699858";

export default function HomePage() {
  redirect(`/runs/${DEFAULT_RUN_ID}`);
}