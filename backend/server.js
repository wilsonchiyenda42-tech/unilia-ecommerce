// ===============================
// GET ALL LISTINGS
// ===============================

app.get(
  '/api/listings',
  async (req, res) => {
    try {
      const q =
        String(
          req.query.q || ''
        ).trim();

      const params = [];

      let sql = `
        SELECT
          l.*,
          u.name AS seller_name
        FROM listings l
        JOIN users u
          ON u.id = l.seller_id
        WHERE 1=1
      `;

      if (q) {
        sql += `
          AND (
            l.name LIKE ?
            OR l.description LIKE ?
            OR l.location LIKE ?
          )
        `;

        const like =
          `%${q}%`;

        params.push(
          like,
          like,
          like
        );
      }

      sql += `
        ORDER BY l.created_at DESC
      `;

      const [
        rows
      ] =
        await pool.execute(
          sql,
          params
        );

      ok(res, {
        listings: rows
      });

    } catch (e) {
      console.error(
        'GET /api/listings ERROR:',
        e
      );

      res.status(500).json({
        success: false,
        error: e.message,
        code: e.code
      });
    }
  }
);
