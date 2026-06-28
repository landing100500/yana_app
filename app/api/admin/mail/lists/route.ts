import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailList from '@/models/MailList';
import MailListMember from '@/models/MailListMember';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const lists = await MailList.findAll({ order: [['createdAt', 'DESC']] });
    const withCounts = await Promise.all(
      lists.map(async (list) => {
        const memberCount = await MailListMember.count({ where: { listId: list.id } });
        return { ...list.toJSON(), memberCount };
      })
    );

    return NextResponse.json({ lists: withCounts });
  } catch (error) {
    console.error('Mail lists GET error:', error);
    return NextResponse.json({ error: 'Failed to load lists' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { name, description } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const list = await MailList.create({
      name: String(name),
      description: description ? String(description) : null,
    });

    return NextResponse.json({ list });
  } catch (error) {
    console.error('Mail lists POST error:', error);
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
  }
}
