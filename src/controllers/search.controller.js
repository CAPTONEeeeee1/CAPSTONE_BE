const { prisma } = require('../shared/prisma');


async function searchCards(req, res) {
  try {
    const {
      boardId,
      q,
      labelId,
      memberId,
      listId,
      dueBefore,
      dueAfter,
      limit: limitRaw,
    } = req.query;

    if (!boardId) return res.status(400).json({ error: 'boardId required' });

    const bm = await prisma.boardMember.findFirst({
      where: { boardId: String(boardId), userId: req.user.id },
      select: { id: true },
    });
    if (!bm) return res.status(403).json({ error: 'Not a board member' });

    const whereClauses = ['c."boardId" = $1'];
    const params = [String(boardId)];
    let p = 2;

    let hasQuery = false;
    if (typeof q === 'string' && q.trim().length > 0) {
      hasQuery = true;
      whereClauses.push(
        `to_tsvector('simple', coalesce(c."title",'') || ' ' || coalesce(c."description",'')) @@ plainto_tsquery($${p})`
      );
      params.push(q.trim());
      p++;
    }

    if (listId) {
      whereClauses.push(`c."listId" = $${p}`);
      params.push(String(listId));
      p++;
    }

    if (labelId) {
      whereClauses.push(
        `EXISTS (SELECT 1 FROM "CardLabel" cl WHERE cl."cardId" = c."id" AND cl."labelId" = $${p})`
      );
      params.push(String(labelId));
      p++;
    }

    if (memberId) {
      whereClauses.push(
        `EXISTS (SELECT 1 FROM "CardMember" cm WHERE cm."cardId" = c."id" AND cm."userId" = $${p})`
      );
      params.push(String(memberId));
      p++;
    }

    if (dueAfter) {
      whereClauses.push(`c."dueDate" IS NOT NULL AND c."dueDate" >= $${p}`);
      params.push(new Date(dueAfter));
      p++;
    }

    if (dueBefore) {
      whereClauses.push(`c."dueDate" IS NOT NULL AND c."dueDate" <= $${p}`);
      params.push(new Date(dueBefore));
      p++;
    }

    let limit = Number(limitRaw || 100);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 200) limit = 200;

    let rankSelect = 'NULL::float AS rank';
    let orderBy = 'c."updatedAt" DESC';
    if (hasQuery) {
      const qIdx = params.findIndex((v, i) => typeof v === 'string' && v === q.trim()) + 1;
      rankSelect = `ts_rank(
        to_tsvector('simple', coalesce(c."title",'') || ' ' || coalesce(c."description",'')),
        plainto_tsquery($${qIdx})
      ) AS rank`;
      orderBy = `rank DESC NULLS LAST, c."updatedAt" DESC`;
    }

    const sql = `
      SELECT
        c."id",
        c."title",
        c."description",
        c."listId",
        c."orderIdx",
        c."keySeq",
        ${rankSelect}
      FROM "Card" c
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit};
    `;

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return res.json({ results: rows });
  } catch (err) {
    console.error('searchCards error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { searchCards };