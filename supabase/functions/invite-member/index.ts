import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 呼び出し元の認証チェック（管理者のみ許可）
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 呼び出し元のセッションを確認
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '認証エラー' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 呼び出し元のroleを確認（president/directorのみ）
    const { data: caller } = await anonClient
      .from('members')
      .select('role')
      .eq('email', user.email)
      .single()

    const ALLOWED = ['president', 'vice_president', 'director']
    if (!caller || !ALLOWED.includes(caller.role)) {
      return new Response(JSON.stringify({ error: '権限がありません' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // リクエストボディ取得
    const { email, name, yomi, part, role, committee, member_type, org_id } = await req.json()
    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'email と name は必須です' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // service_roleクライアントで招待
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Supabase Authに招待メール送信
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `https://higashiosakawinds-prog.github.io/higasui/member.html`,
    })
    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // membersテーブルに同時作成
    const { error: memberError } = await adminClient
      .from('members')
      .insert({
        org_id: org_id || '37cf6fef-551a-4159-b6ab-5010c3951aa8',
        name,
        yomi:        yomi        || null,
        email,
        part:        part        || null,
        role:        role        || 'member',
        committee:   committee   || null,
        member_type: member_type || '正会員（大人）',
        status:      'active',
        joined_at:   new Date().toISOString().split('T')[0],
      })

    if (memberError) {
      // Auth招待は成功しているのでエラー内容を返す（membersレコードは手動追加が必要）
      return new Response(JSON.stringify({
        warning: 'Auth招待は成功しましたが、membersテーブルへの追加に失敗しました',
        error: memberError.message
      }), {
        status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, email }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
