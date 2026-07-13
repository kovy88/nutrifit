const { method, requireUser, sendError, supabaseRest, msg, rateLimit } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['DELETE', 'POST'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;
  if (!(await rateLimit(req, res, 'delete-account', 5))) return;

  try {
    const userId = requester.user.id;
    await supabaseRest('/rest/v1/rpc/delete_user_account_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId }),
    });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const authDelete = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!authDelete.ok) {
      const text = await authDelete.text().catch(() => '');
      throw new Error(text || `Auth deletion failed (${authDelete.status})`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, 500, 'delete_failed', err.message || msg(req, 'Smazání účtu se nepodařilo.', 'Account deletion failed.'));
  }
};
