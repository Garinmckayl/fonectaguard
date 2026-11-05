import { ulid } from "ulid";
export const newId = () => ulid();
export const now = () => Date.now();
