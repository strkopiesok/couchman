export default function (doc) {
  if (doc.type !== "article") return;
  index("title", doc.title, { store: true });
}
