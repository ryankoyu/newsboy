import { dataProvider } from "@/lib/data";
import { SavedView } from "@/components/SavedView";

export default async function SavedPage() {
  const edition = await dataProvider.getLatestEdition();
  return <SavedView edition={edition} />;
}
