import * as React from "react";
import { createRoot } from "react-dom/client";
import { SayHello } from "./message";

export function run() {
  console.log(SayHello);
  const element = document.getElementById("app");

  createRoot(element).render(<SayHello />);
}
