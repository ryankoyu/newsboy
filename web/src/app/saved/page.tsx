import { dataProvider } from "@/lib/data";
import { MyView } from "@/components/MyView";

export default async function SavedPage() {
  const edition = await dataProvider.getLatestEdition();
  return <MyView edition={edition} />;
}
