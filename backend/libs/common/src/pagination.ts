/**
 * @param {Object} param
 * @param {number} param.skip
 * @param {number} param.limit
 * @param {string} param.sortBy
 * @param {string} param.order
 * @param {string} param.getType
 * @returns {Object}
 */
type GetPaginationParams = {
   skip?: number;
   limit?: number;
   sortBy?: string;
   order?: "asc" | "desc";
   getType?: "all" | string;
};

type Pagination = {
   skip?: number;
   take?: number;
   orderBy?: Record<string, "asc" | "desc">;
};

const getPagination = ({ skip, limit, sortBy, order = "desc", getType }: GetPaginationParams): Pagination => {
   const pagination: Pagination = {};

   if (sortBy) {
      pagination.orderBy = { [sortBy]: order };
   }
   if (getType !== "all") {
      if (skip) pagination.skip = Number(skip);
      if (limit) pagination.take = Number(limit);
   }

   return pagination;
};

export default getPagination;
