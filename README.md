# `@eighty4/poultry` on npm

## Pulls code samples from GitHub repo trees

This utility is for collecting language samples for AST testing.

Getting started is quick and easy with your favorite NPM package manager:

```shell
npm i -g @eighty4/poultry
```

### Required for auth!

`poultry` uses the `GH_TOKEN` environment variable to authorize requests to the GitHub Search Code API
for searching for language samples and GraphQL API for retrieving file contents.

### Output

Files will be written to the `--out-dir` in a flat structure using repo name, subpath and filename.
For example, the output path for a file from Apache Cassandra's docs will be `apache_cassandra_doc_modules_cassandra_examples_CQL_sum.cql`.

### Example

Here is an example of collecting CQL for Cassandra from Apache, Datastax & ScyllaDB accounts:

```shell
GH_TOKEN=$(gh auth token) poultry --ext cql --lang sql --user apache --user datastax --user scylladb --out-dir out
```

## Search options

Supported options mirror the search qualifiers available for the query string of the Search Code API
including `extension`, `lang`, `org` & `user` and can be included multiple times just like the Search Code API query string.

Full listing of options available with `poultry --help` and thorough details are on the
[GitHub Search Code API documentation](https://docs.github.com/en/search-github/searching-on-github/searching-code)!
