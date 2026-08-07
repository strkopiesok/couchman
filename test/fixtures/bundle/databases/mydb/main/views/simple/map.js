const factor = 2;
export default (doc) => {
  if (doc.n) emit(doc.n, doc.n * factor);
};
