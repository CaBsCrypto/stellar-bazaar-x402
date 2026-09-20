import dynamic from "next/dynamic";
import "../history.css";
import "../deliveries.css";

const DeliverableReview = dynamic(
  () => import("@/components/DeliverableReview").then((mod) => mod.DeliverableReview),
  { ssr: false }
);

export default function ReviewPage() {
  return <DeliverableReview />;
}
