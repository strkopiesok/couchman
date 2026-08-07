export default function (newDoc, oldDoc, userCtx) {
  if (!newDoc.type) throw { forbidden: "type is required" };
}
