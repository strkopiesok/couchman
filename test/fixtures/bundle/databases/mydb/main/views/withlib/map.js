import { bump } from "../../_lib/local.js";
export default function (doc) {
  emit(bump(doc.n), 1);
}
