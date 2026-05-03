<<<<<<< HEAD
﻿import { NextResponse } from 'next/server';
=======
import { NextResponse } from 'next/server';
>>>>>>> 098cb64ae266e787c7f7a62d30d528c12b015b63
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

<<<<<<< HEAD
=======
  // Auth failed — redirect back to login with error
>>>>>>> 098cb64ae266e787c7f7a62d30d528c12b015b63
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
