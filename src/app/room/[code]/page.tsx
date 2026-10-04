import { Tabletop } from '../../../components/tabletop';
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Tabletop code={code.toUpperCase()} />;
}
