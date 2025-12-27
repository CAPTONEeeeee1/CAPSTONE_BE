function attachSocket(req, res, next) {
  req.io = req.app.get('io');
  req.chatNamespace = req.app.get('chatNamespace');
  req.boardNamespace = req.app.get('boardNamespace');
  next();
}

module.exports = { attachSocket };
