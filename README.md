# matrix-blog

A library to interact with a Matrix server in a way that treats it as a backend for a blog.

Check out [matrix-blog-admin](https://github.com/evoL/matrix-blog-admin) — the admin panel for matrix-blog.

See my blog for a write-up on how this works: https://evolved.systems/hosting-a-blog-on-matrix/

## Example (node.js)

```js
import { BlogService, MatrixClient } from 'matrix-blog';
import fetch from 'node-fetch';

const serverName = 'example.com';
const homeserverUrl = 'https://example.com';
const blogSpaceId = '!somethingsomething:example.com';
const accessToken = 'YOUR_ACCESS_TOKEN';

const client = new MatrixClient(serverName, homeserverUrl, fetch);
const blog = new BlogService(client);

client.setAccessToken(accessToken);

// Fetches blog posts along with their contents.
blog.getFullPosts(blogSpaceId).then((posts) => {
  console.log(posts);
});
```

## License

Written by Rafał Hirsz. This package is licensed under the terms of the MIT license.
