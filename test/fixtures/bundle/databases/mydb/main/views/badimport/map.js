import _ from "lodash";
export default function (doc) {
  emit(_.identity(doc._id), 1);
}
