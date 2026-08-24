"use client";

import styles from "./TextResponse.module.css";
import type { ReactNode } from "react";

export function TextResponse({ children }: { children?: ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}
