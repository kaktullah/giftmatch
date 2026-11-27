import type { Metadata } from "next";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Find a gift · GiftMatch" };

export default function FindPage() {
  return <Wizard />;
}
