import { deaccent } from "../../../../../shared/text.js";
export default function (doc) {
  if (doc.title) emit(deaccent(doc.title), 1);
}
