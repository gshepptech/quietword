// Fixture responses for the verbose error check. Paths and names are invented.

export const NODE_STACK = `{"message":"Cannot read properties of undefined (reading 'id')","stack":"TypeError: Cannot read properties of undefined (reading 'id')
    at getUser (/var/www/app/.next/server/app/api/users/route.js:412:31)
    at async handler (/var/www/app/node_modules/next/dist/server/route.js:88:12)"}`;

export const PYTHON_TRACEBACK = `Traceback (most recent call last):
  File "/app/main.py", line 42, in get_user
    return db.query(User).filter(User.id == user_id).one()
  File "/usr/local/lib/python3.11/site-packages/sqlalchemy/orm/query.py", line 2870, in one
    raise exc.NoResultFound("No row was found")
sqlalchemy.exc.NoResultFound: No row was found`;

export const PRISMA_ERROR = `{"error":"Invalid \`prisma.user.findUnique()\` invocation:\\n\\nThe column \`User.deletedAt\` does not exist in the current database."}`;

export const POSTGRES_ERROR = `{"code":"23505","message":"duplicate key value violates unique constraint \\"users_email_key\\""}`;

export const FLASK_DEBUG_PAGE = `<!doctype html><html><head><title>ValueError // Werkzeug Debugger</title></head>
<body class="werkzeug"><h1>ValueError</h1><div class="detail">Werkzeug Debugger</div>
<div class="traceback"><h3>Traceback (most recent call last):</h3></div></body></html>`;

/** A tidy 404. Nothing here should be reported. */
export const CLEAN_404 = `{"error":"Not found"}`;

export const CLEAN_HTML_404 = `<!doctype html><html><head><title>404</title></head>
<body><h1>Page not found</h1><p>We could not find that page. <a href="/">Go home</a></p></body></html>`;

/**
 * A minified bundle containing somebody else's stack-trace parsing code. The
 * check must not fire on this, which is why it never reads JavaScript assets.
 */
export const BUNDLE_WITH_TRACE_PARSER = `var e=/at (.+?) \\((.+?):(\\d+):(\\d+)\\)/;function t(n){return n.stack.split("\\n").map(function(r){var i=e.exec(r);return i?{fn:i[1],file:i[2]}:null})}`;
