import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { discoveryResponse } from "@/lib/discovery-response";

export async function GET(): Promise<NextResponse> {
	return discoveryResponse(await auth.api.getOAuthServerConfig());
}
