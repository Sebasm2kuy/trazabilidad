import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await db.shipment.findUnique({ where: { id } });
  if (!shipment) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json(shipment);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const shipment = await db.shipment.update({ where: { id }, data: body });
  return NextResponse.json(shipment);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.shipment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}