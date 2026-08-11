import { dataProvider } from "@/lib/data";
import { SkinnedMyView } from "@/components/newsprint/SkinnedMyView";

export default async function SavedPage() {
  const edition = await dataProvider.getLatestEdition();
  return <SkinnedMyView edition={edition} />;
}
