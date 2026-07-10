import { dataProvider } from "@/lib/data";
import { HomeView } from "@/components/HomeView";

export default async function Home() {
  const edition = await dataProvider.getLatestEdition();
  return <HomeView edition={edition} />;
}
