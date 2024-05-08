# Algolia-search plugin for medusa e-commerce app

This plugin was copied and fixed from [medusa.js official repository](https://github.com/medusajs/medusa)

## Algolia

Provide powerful indexing and searching features in your commerce application with Algolia.

[Medusa Website](https://medusajs.com) | [Medusa Repository](https://github.com/medusajs/medusa)

## Features

- Flexible configurations for specifying searchable and retrievable attributes.
- Ready-integration with [Medusa's Next.js starter storefront](https://docs.medusajs.com/starters/nextjs-medusa-starter).
- Utilize Algolia's powerful search functionalities including typo-tolerance, query suggestions, results ranking, and more.

---

## Prerequisites

- [Medusa backend](https://docs.medusajs.com/development/backend/install)
- [Algolia account](https://www.algolia.com/)

---

## How to Install

1\. Run the following command in the directory of the Medusa backend:

  ```bash
  npm install medusa-plugin-algolia-search
  ```

2\. Set the following environment variables in `.env`:

  ```bash
  ALGOLIA_APP_ID=<YOUR_APP_ID>
  ALGOLIA_ADMIN_API_KEY=<YOUR_ADMIN_API_KEY>
  ```

3\. In `medusa-config.js` add the following at the end of the `plugins` array:

  ```js
const plugins = [
  // ...
  {
    resolve: `medusa-plugin-algolia-search`,
    options: {
      applicationId: process.env.ALGOLIA_APP_ID,
      adminApiKey: process.env.ALGOLIA_ADMIN_API_KEY,
      settings: {
        products: {
          indexSettings: {
			indexName: 'products'
            searchableAttributes: ["title", "description"],
            attributesToRetrieve: [
              "id",
              "title",
              "description",
              "handle",
              "thumbnail",
              "variants",
              "variant_sku",
              "options",
              "collection_title",
              "collection_handle",
              "images",
            ],
          },
		  filter: (product) => product.status == "published",
          transformer: (product) => ({ 
            id: product.id, 
            // other attributes...
          }),
        },
      },
    },
  },
]
  ```

---

## Test the Plugin

1\. Run the following command in the directory of the Medusa backend to run the backend:

  ```bash
  npm run start
  ```

2\. Try searching products either using your storefront or using the [Store APIs](https://docs.medusajs.com/api/store#tag/Product/operation/PostProductsSearch).

