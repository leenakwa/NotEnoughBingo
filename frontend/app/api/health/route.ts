export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "frontend" },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
