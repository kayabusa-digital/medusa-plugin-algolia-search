import { Logger, MedusaContainer, SearchTypes } from '@medusajs/types'
import { AbstractSearchService, SearchUtils } from '@medusajs/utils'
import Algolia, { SearchClient } from 'algoliasearch'
import { AlgoliaPluginOptions, SearchOptions } from '../types'

class AlgoliaService extends SearchUtils.AbstractSearchService {
	isDefault = false

	protected readonly config_: AlgoliaPluginOptions
	protected readonly logger_: Logger
	protected readonly client_: SearchClient
	static _isSearchService: boolean = true

	constructor(
		container: MedusaContainer & { logger: Logger },
		options: AlgoliaPluginOptions
	) {
		super(container, options)

		this.config_ = options
		this.logger_ = container['logger']

		const { applicationId, adminApiKey } = options

		if (!applicationId) {
			throw new Error('Please provide a valid Application ID')
		}

		if (!adminApiKey) {
			throw new Error('Please provide a valid Admin Api Key')
		}

		this.client_ = Algolia(applicationId, adminApiKey)
	}

	static isSearchService(obj: any): obj is AbstractSearchService {
		return obj.prototype._isSearchService
	}

	private getMappedIndexName(indexName: string): string {
		return (
			this.config_.settings?.[indexName]?.indexSettings.indexName ??
			indexName
		)
	}

	/**
	 * Add two numbers.
	 * @param {string} indexName - The name of the index
	 * @param {*} options - not required just to match the schema we are used it
	 * @return {*}
	 */
	createIndex(indexName: string, options: Record<string, unknown> = {}) {
		return this.client_.initIndex(this.getMappedIndexName(indexName))
	}

	/**
	 * Used to get an index
	 * @param {string} indexName  - the index name.
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async getIndex(indexName: string) {
		let hits: Record<string, unknown>[] = []

		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.browseObjects({
				query: this.getMappedIndexName(indexName),
				batch: (batch) => {
					hits = hits.concat(batch)
				},
			})
			.then(() => hits)
	}

	/**
	 *
	 * @param {string} indexName
	 * @param {Array} documents - products list array
	 * @param {*} type
	 * @return {*}
	 */
	async addDocuments(indexName: string, documents: any, type: string) {
		const transformedDocuments = await this.getTransformedDocuments(
			type,
			documents
		)

		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.saveObjects(transformedDocuments)
	}

	/**
	 * Used to replace documents
	 * @param {string} indexName  - the index name.
	 * @param {Object} documents  - array of document objects that will replace existing documents
	 * @param {Array.<Object>} type  - type of documents to be replaced (e.g: products, regions, orders, etc)
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async replaceDocuments(indexName: string, documents: any, type: string) {
		const transformedDocuments = await this.getTransformedDocuments(
			type,
			documents
		)
		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.replaceAllObjects(transformedDocuments)
	}

	/**
	 * Used to delete document
	 * @param {string} indexName  - the index name
	 * @param {string} documentId  - the id of the document
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async deleteDocument(indexName: string, documentId: string) {
		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.deleteObject(documentId)
	}

	/**
	 * Used to delete all documents
	 * @param {string} indexName  - the index name
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async deleteAllDocuments(indexName: string) {
		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.delete()
	}

	/**
	 * Used to search for a document in an index
	 * @param {string} indexName - the index name
	 * @param {string} query  - the search query
	 * @param {*} options
	 * - any options passed to the request object other than the query and indexName
	 * - additionalOptions contain any provider specific options
	 * @return {*} - returns response from search engine provider
	 */
	async search(
		indexName: string,
		query: string,
		options: SearchOptions & Record<string, unknown>
	) {
		const { paginationOptions, filter, additionalOptions } = options

		// fit our pagination options to what Algolia expects
		if ('limit' in paginationOptions && paginationOptions.limit != null) {
			paginationOptions['length'] = paginationOptions.limit
			delete paginationOptions.limit
		}

		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.search(query, {
				filters: filter,
				...paginationOptions,
				...additionalOptions,
			})
	}

	/**
	 * Used to update the settings of an index
	 * @param  {string} indexName - the index name
	 * @param {object} settings  - settings object
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async updateSettings(
		indexName: string,
		settings: SearchTypes.IndexSettings & Record<string, unknown>
	) {
		// backward compatibility
		const indexSettings = settings.indexSettings ?? settings ?? {}

		return await this.client_
			.initIndex(this.getMappedIndexName(indexName))
			.setSettings(indexSettings)
	}

	async getTransformedDocuments(type: string, documents: any[]) {
		if (!documents?.length) {
			return []
		}

		const productsTransformer =
			this.config_.settings?.[SearchUtils.indexTypes.PRODUCTS]
				?.transformer ?? null
		const productsFilter =
			this.config_.settings?.[SearchUtils.indexTypes.PRODUCTS]?.filter ??
			null

		if (productsTransformer == null) {
			this.logger_.warn('Products transformer not provided')
			return []
		}

		if (productsFilter == null) {
			this.logger_.warn('Products filter not provided')
		}

		switch (type) {
			case SearchUtils.indexTypes.PRODUCTS:
				return documents
					.filter(productsFilter ?? (() => true))
					.map(productsTransformer)
			default:
				return documents
		}
	}
}

export default AlgoliaService
