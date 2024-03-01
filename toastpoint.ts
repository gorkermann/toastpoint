export let config: { [key: string]: any } = {
	PRINT: false,
	DEBUG: false,
	WRITE_PTR_CLASSNAME: false,
}

export let log: { [key: string]: any } = {
	TRAIL: '',
}

type Dict<Type> = { [key: string]: Type };
type FactoryFunc = () => Object;

/*
	when reading from JSON, the class name in the __class__ field
	cannot be found in the toaster  
 */
class MissingConstructorError extends Error {
	constructor( className: string ) {
		super();

		this.name = 'MissingConstructor';
		this.message = 'Missing constructor for ' + className;
	}
}

/*
	object's own toToast method failed for some reason
 */
class BadConversionError extends Error {
	constructor( className: string ) {
		super();

		this.name = 'BadConversion';
		this.message = 'Bad conversion from ' + className;
	}	
}

/*
	TrailEntry

	describes the field obj.varname
*/
class TrailEntry {
	obj: any;
	varname: string | number;

	constructor( obj: any, varname: string | number ) {
		this.obj = obj;
		this.varname = varname;
	}
}

type TrailPrintOptions = {
	reading?: boolean;
	msg?: string;
	loopIndex?: number;
}

function describeType( obj: any, options: TrailPrintOptions={} ): string {
	let str = '';
	let objType = '';
	let id = '';

	if ( obj instanceof Object ) {
		if ( options.reading ) {
			objType += obj['__class__']; // if reading, we don't have an object to get the constructor name from			
		} else {
			objType += obj.constructor.name;
		}

		if ( '__id__' in obj ) {
			id = ', addr=' + obj['__id__'];

		} else if ( options.reading && '__pointer__' in obj ) { // pointers only occur when reading
			objType += '*';
			id = ', addr=' + obj['__pointer__'];
		}

		str = '(' + objType + id + ')';

	} else if ( typeof obj == 'string' || typeof obj == 'number' ) {
		str = 'literal';
	}

	return str;
}

function printFinalVar( trail: Array<TrailEntry>, options: TrailPrintOptions={} ) {
	if ( options.msg === undefined ) options.msg = '';

	if ( trail.length < 1 ) {
		return;
	}

	let str = '';

	// pad out for depth
	for ( let entry of trail ) {
		str += '  ';
	}

	// variable name or array index
	str += trail[trail.length - 1].varname + ' ';

	let obj = trail[trail.length - 1].obj;

	// object value and type
	if ( typeof( obj ) == 'string' ) {
		str += '\"' + obj + '\"' + ' ';

	} else {
		str += obj + ' ';
	}

	str += describeType( obj, options );

	if ( config.PRINT ) console.log( str );
	log.TRAIL += str + options.msg + '\n';
}

/*
	Toaster

	aids in traversing the object tree and reporting errors when they arise
 */
export class Toaster {
	 // list of functions used to instantiate classes
	constructors: Dict<FactoryFunc> = {};

	// mapping of class names to try and translate obfuscated code
	// can be left empty or incomplete, 
	nameMap: Dict<string> = {};

	addrIndex: Array<any> = []; // record of objects seen, array index is obj.__id__
	
	// record of whether a pointer was ever created for a given __id__
	// (if not, omit them from the output for clarity and to save space)
	usedAddrs: Array<boolean> = []; 

	outputList: Array<any> = []; // list of objects created (easier to traverse than a tree)
	trail: Array<TrailEntry> = []; // record of where we are in the object tree

	errors: Array<string> = [];

	constructor( constructors: Dict<FactoryFunc>, nameMap?: Dict<string> ) {
		if ( nameMap === undefined ) nameMap = {};

		this.constructors = constructors;
		this.nameMap = nameMap;
	}

	copy( entry: TrailEntry ): Toaster {
		let toaster = new Toaster( this.constructors, this.nameMap );
		toaster.addrIndex = this.addrIndex;
		toaster.usedAddrs = this.usedAddrs;
		toaster.outputList = this.outputList;
		toaster.errors = this.errors;
		toaster.trail = this.trail.concat( entry );

		return toaster;
	}

	/**
	 * Checks whether an object is one of those the Toaster can create
	 * 
	 * @param {Object} some object
	 * @param {Toaster} helper object, used here for its constructor list
	 *
	 * @throws {MissingConstructorError} if the necessary constructor is not found
	 */
	private checkConstructor( obj: Object ) {
		if ( obj ) {
			if ( !this.getName( obj ) ) {
				let ex = new MissingConstructorError( obj.constructor.name );

				throw ex;
			}		
		}
	}

	/**
	 * adds an object to a Toaster's addrIndex
	 * 
	 * @param  {any} some object
	 * @param  {Toaster} helper object, used here for its addrIndex
	 * @param  {boolean=false} force setting __written__
	 * @return {boolean} whether obj was written to toaster.addrIndex
	 *
	 * @throws {Error} on __id__ collision
	 */
	addToIndex( obj: any, prewritten: boolean=false ): boolean {
		if ( obj instanceof Object ) {
			this.checkConstructor( obj );

			if ( !( '__id__' in obj ) ) {
				this.addrIndex.push( obj );
				obj['__id__'] = this.addrIndex.length - 1;
				obj['__written__'] = prewritten;

				return true;

			} else {
				if ( this.addrIndex[obj['__id__']] != obj ) {
					throw new Error( 
						'addToIndex: __id__ collision at ' + obj['__id__'] );
				}
			}
		}

		return false;
	}

	/**
	 * Reports whether an object should be fully written to the output, or 
	 * can be output as a simple pointer
	 *
	 * __written__ is usually set by toJSON(), but is set prematurely in listToJSON()
	 * so that all of the toplevel objects are output fully, not as pointers, to make
	 * files easier for a human to read
	 * 
	 * @param {any} some object, which may or may not have __id__ set
	 * @param {Toaster} helper object, used here for its index of __id__
	 *
	 * @return {boolean} whether the object should be output as a pointer
	 */
	shouldBePointer( obj: any ): boolean {
		if ( obj instanceof Object && '__id__' in obj ) {
			if ( obj['__id__'] in this.addrIndex && obj['__written__'] ) {
				return true;
			}
		}

		// either not a pointer-able object, or needs to be added to addrIndex
		return false;
	}

	/**
	 * removes variables used in JSONifying
	 */
	cleanAddrIndex() {
		for ( let i = 0; i < this.addrIndex.length; i++ ) {
			if ( !( i in this.addrIndex ) ) {
				console.log( 'listToJSON: missing __id__ ' + i );
			}
		}

		for ( let obj of this.addrIndex ) {
			if ( !( '__id__' in obj ) ) {
				console.warn( 'listToJSON: object lacks __id__' );
			}
			
			delete obj['__id__'];
			delete obj['__written__'];
		}
	}

	getName( obj: Object ): string {
		if ( !obj || !obj.constructor.name ) {
			return null;
		}

		let name = obj.constructor.name;

		if ( name == 'Object' || name == 'Array' ) {
			return name;

		} else if ( name in this.nameMap ) {
			return this.nameMap[name];

		} else if ( Object.keys( this.nameMap ).length == 0 && 
					name in this.constructors ) {
			return name;

		} else {
			return null;
		}
	}

	trailToString( options: TrailPrintOptions={} ): string {
		if ( options.loopIndex === undefined ) options.loopIndex = -1;

		let str = '';

		for ( let i = 0; i < this.trail.length; i++ ) {
			let entry = this.trail[i];

			// variable name or index
			if ( typeof( entry.varname ) == 'number' || !isNaN( parseInt( entry.varname ) ) ) {
				str += '[' + entry.varname + ']';
			
			} else if ( typeof( entry.varname ) == 'string' ) {
				str += '.' + entry.varname;
			}
			
			// variable type and address (if applicable)
			str += ' ' + describeType( entry.obj, options );

			// show where the loop occurs (if one is present)
			if ( options.loopIndex > 0 ) {
				if ( i == options.loopIndex ) str += ' <-';
				if ( i == this.trail.length - 1 ) str += ' ->'
			}

			str += ' ';
		}

		return str;
	}
}

/* 
	Write Functions
*/

export function singleToJSON( obj: any,
							  constructors: Dict<FactoryFunc>,
							  nameMap?: Dict<string> ): any {
	if ( nameMap === undefined ) nameMap = {};

	let list = listToJSON( [obj], constructors, nameMap );

	return list[0];
}

export function listToJSON( list: Array<any>, 
							constructors: Dict<FactoryFunc>,
							nameMap?: Dict<string> ): any {
	if ( nameMap === undefined ) nameMap = {};

	let output: Array<any> = [];

	log.TRAIL = '';
	let toaster = new Toaster( constructors, nameMap );

	try {
		// write the list objects first, so they get the first list.length addresses
		for ( let i = 0; i < list.length; i++ ) {
			toaster.addToIndex( list[i], true );
		}

		for ( let i = 0; i < list.length; i++ ) {
			setJSON( output, i, list[i], toaster, true );
			//output[i] = toJSON( list[i], toaster.copy( new TrailEntry( list[i], i ) ), true );
		}

		// delete ids with no pointers
		for ( let obj of toaster.outputList ) {
			if ( '__id__' in obj && !( obj['__id__'] in toaster.usedAddrs ) ) {
				delete obj['__id__'];
			}
		}

	} catch ( ex ) {
		throw ex;

	} finally {
		toaster.cleanAddrIndex();
	}

	return output;
}

export function setMultiJSON( target: any,
							  varnames: Array<string | number>,
							  obj: any,
							  toaster: Toaster ) {

	for ( let varname of varnames ) {
		if ( !( varname in obj ) ) {
			throw new Error(
				'setMultiJSON: No key ' + varname + ' in ' + toaster.getName( obj ) );
		}

		setJSON( target, varname, obj[varname], toaster );
	}
}

/**
 * set a field of some object to a JSONified object
 * target.varname = JSONify(obj)
 * 
 * @param {any}           target   object on which to set the field
 * @param {string|number} varname  variable name for the field
 * @param {any}           obj      object to JSONify
 * @param {Toaster}       toaster
 * @param {boolean=false} toplevel
 */
export function setJSON( target: any, 
						 varname: string | number, 
						 obj: any, 
						 toaster: Toaster, 
						 toplevel: boolean=false ) {

	if ( varname == '__written__' ) return;

	target[varname] = toJSON( obj, 
							  toaster.copy( new TrailEntry( obj, varname ) ), 
							  toplevel );
}

export function toJSON( obj: any, toaster: Toaster, toplevel: boolean=false ): any {
	try {
		if ( config.DEBUG ) printFinalVar( toaster.trail );

		if ( toaster.trail.length > 20 ) {
			console.error( toaster.trailToString() );
			throw new Error( 'Maximum recursion depth exceeded' );
		}

		if ( obj === null || obj === undefined ) {
			return obj;

		// objects from classes in 'constructors'
		} else if ( !toplevel && toaster.shouldBePointer( obj ) ) {
			return toJSONPointer( obj, toaster );

		} else if ( obj instanceof Object ) {
			toaster.addToIndex( obj );

			let flat: any = {};

			if ( '__id__' in obj ) {
				flat['__id__'] = obj['__id__'];
				obj['__written__'] = true;
			}

			let className = toaster.getName( obj );
			if ( className != 'Object' && className != 'Array' ) {
				flat['__class__'] = className;
			}

			if ( obj.toToast ) {
				let conv = obj.toToast( toaster );

				if ( !conv ) {
					throw new BadConversionError( toaster.getName( obj ) );
				}

				flat = { ...flat, ...conv };

			} else {
				let target = flat;
				if ( obj instanceof Array ) {
					flat['__array__'] = [];
					target = flat['__array__'];
				}

				// keys of an {}, indices of a []
				for ( let varname in obj ) {
					if ( varname == '__written__') continue;

					setJSON( target, varname, obj[varname], toaster );
					//target[varname] = toJSON( obj[varname], 
					//						  toaster.copy( new TrailEntry( obj[varname], varname ) ) );			
				}
			}

			toaster.outputList.push( flat );
			return flat;

		// numbers
		} else if ( typeof( obj ) == 'number' ) {
			return Number( obj.toFixed( 3 ) );

		// other literals
		} else {
			return obj
		}

	} catch ( ex ) {
		if ( ex instanceof MissingConstructorError ) {
			toaster.errors.push( ex.message + ': ' + toaster.trailToString() );
		}

		throw ex;
	}
}

export function toJSONPointer( obj: any, toaster: Toaster ): any {
	if ( obj === null || obj === undefined ) {
		return null;

	} else if ( !( '__id__' in obj ) ) {
		toaster.addToIndex( obj, false );
	}

	let output: any = { "__pointer__": obj['__id__'] };

	if ( config.WRITE_PTR_CLASSNAME ) {
		output['__class__'] = toaster.getName( obj );
	}

	toaster.usedAddrs[obj['__id__']] = true;

	return output;
}

/*
	Read Functions
 */

/**
 * adds an object's __id__ to a toaster's addrIndex
 * 
 * @param {any}     json    json object
 * @param {any}     obj     js object based on json object 
 * @param {Toaster} toaster
 */
function indexOnRead( json: any, obj: any, toaster: Toaster ) {
	// add to id index
	if ( '__id__' in json ) {
		if ( json['__id__'] in toaster.addrIndex ) {
			console.error( toaster.trailToString( { reading: true } ) );

			let str = toaster.getName( toaster.addrIndex[json['__id__']] ) + ', '
					  toaster.getName( obj );

			throw new Error( 
				'indexOnRead(): __id__ collision at ' + json['__id__'] + ': ' + str );
		}

		toaster.addrIndex[json['__id__']] = obj;
	}	
}

type FromJSONOptions = {
	warnExternal?: boolean; // warn user of top-level primtives that are not in the 
}

export function fromJSON( json: any, toaster: Toaster, options: FromJSONOptions={} ): any {
	if ( options.warnExternal === undefined ) options.warnExternal = true;

	log.TRAIL = '';

	let obj = fromJSONRecur( json, toaster );

	resolveObject( obj, toaster );

	return obj;
}

function fromJSONRecur( json: any, toaster: Toaster ) {
	if ( config.DEBUG ) printFinalVar( toaster.trail, { reading: true } )

	if ( toaster.trail.length > 20 ) {
		console.error( toaster.trailToString( { reading: true } ) );

		throw new Error( 'Maximum recursion depth exceeded' );
	}

	if ( json === null || json === undefined ) {
		return null;

	} else if ( json instanceof Object ) {
		if ( '__pointer__' in json ) {
			return json;
		}

		let obj: any = {};

		// create empty object with factory function
		if ( '__class__' in json ) {
			let className = json['__class__'];

			if ( !( className in toaster.constructors ) ) {
				throw new Error( 'fromJSON: unhandled class ' + className );
			}		

			obj = toaster.constructors[className](); // <-- object created here

		} else if ( json instanceof Array || '__array__' in json ) {
			obj = [];
		}

		// add class members

		// since the same array may be pointed to by multiple variables in the object tree,
		// we need to store its __addr__ somewhere. A JSON list is just the
		// elements, so the array is encapsulated in another object with the
		// __addr__ field 
		let target = json;
		if ( '__array__' in json ) {
			target = json['__array__'];
		}

		for ( let i in target ) {
			if ( i != '__id__' && i != '__class__' ) {
				obj[i] = fromJSONRecur( target[i], 
										toaster.copy( new TrailEntry( target[i], i ) ) );
			}
		}

		indexOnRead( json, obj, toaster );

		return obj;

	// string or number 
	} else {
		return json;
	}
}

/**
 * replace { __pointer__: addr } JSON objects with real objects
 * 
 * @param {any} a JSON object created with toastpoint
 * @param {Toaster}
 */
function resolveObject( obj: any, toaster: Toaster ) {

	// ignore null/undefined and non-objects
	if ( !obj || typeof( obj ) != 'object' ) return;

	// ignore objects that are not in the constructors dict (created inside of other objects by fromJSON)
	if ( !toaster.getName( obj ) ) return;


	if ( config.DEBUG ) printFinalVar( toaster.trail, { reading: true } );

	// look for the current object in the existing trail (if there
	// are no loops, it shouldn't be there)
	let index = toaster.trail.findIndex( ( x ) => x.obj == obj );

	if ( index >= 0 && index < toaster.trail.length - 1 ) {
		console.error( toaster.trailToString( { loopIndex: index } ) );

		throw new Error( 'resolveObject: Loop detected' );
	}

	// can't remember why this isn't just:
	// for ( let i in obj )
	if ( obj instanceof Array ) {
		for ( let i = 0; i < obj.length; i++ ) {
			resolveField( obj, i, toaster.copy( new TrailEntry( obj[i], i ) ) );
		}

	} else if ( obj instanceof Object ) {
		if ( obj['__pointer__'] ) {
			throw new Error( 'Recursing too deep (should have resolved pointer)' );
		}

		for ( let i in obj ) {
			resolveField( obj, i, toaster.copy( new TrailEntry( obj[i], i ) ) );
		}

	} else {
		return;
	}
}

/**
 * if an object is a pointer, return the object that pointer points to
 * (dereference the pointer)
 *
 * if not, do nothing, but look for more pointers inside the object
 * 
 * @param {any} a JSON object created with toastpoint
 * @param {string | number} variable name or array index
 * @param {Toaster} 
 */
function resolveField( obj: any, i: string | number, toaster: Toaster ) {
	if ( obj[i] instanceof Object ) {
		if ( '__pointer__' in obj[i] ) {

			let addr = obj[i]['__pointer__'];

			if ( !( addr in toaster.addrIndex ) ) {
				console.error( toaster.trailToString() );
				console.error( 'resolveField: no pointer with id ' + addr );
				
				obj[i] = null;
			} else {
				obj[i] = toaster.addrIndex[addr];
			}

		} else {

			// don't make a new Toaster here as the trail was already appended to
			resolveObject( obj[i], toaster );
		}
	}
}

function idFilter( obj: any, i: string | number, idList: Array<number> ): boolean {
	return obj && 
		   obj[i] && 
		   typeof( obj[i] ) == 'object' && 
		   typeof( obj[i].id ) == 'number' &&
		   obj[i].id >= 0 &&
		   !idList.includes( obj[i].id );
}

export function pruneList( obj: any, idList: Array<number> ) {

	// ignore null/undefined and non-objects
	if ( !obj || typeof( obj ) != 'object' ) return;

	if ( obj instanceof Array ) {
		for ( let i = obj.length - 1; i >= 0; i-- ) {
			if ( idFilter( obj, i, idList ) ) {
				obj.splice( i, 1 );
			} else {
				pruneList( obj[i], idList );
			}
		}

	// does not properly handle dicts of objects (nulls the entry rather than deleting it)
	} else if ( obj instanceof Object ) {
		let toRemove: Array<string> = [];

		for ( let i in obj ) {
			if ( idFilter( obj, i, idList ) ) {
				//toRemove.push( i );
				obj[i] = null;
			} else {
				pruneList( obj[i], idList );
			}
		}

		for ( let varname of toRemove ) {
			delete obj[varname];
		}

	} else {
		return;
	}
}

/*
	Helper Functions
 */

function printDots( trail: Array<any> ): string {
	let str = '';

	for ( let varname of trail ) {
		if ( typeof( varname ) == 'number' ) {
			str += '[' + varname + ']';
		} else {
			str += '.' + varname;
		}
	}

	return str;
}

export function checkStructure( obj1: any, obj2: any, trail: Array<any>, trail2: Array<any> ): boolean {
	// check for pointer loops
	let index = trail.indexOf( obj1 );

	if ( index >= 0 && index < trail.length - 1 ) {
		return true;
	}

	let result: boolean = true;

	for ( let i in obj1 ) {

		// missing key
		if ( !( i in obj2 ) ) {
			console.log( printDots( trail2 ) + '.' + i + ' missing from obj2' );
			return false;		
		}

		// object, might have to recur
		if ( obj1[i] instanceof Object ) {
			let type1 = obj1[i].constructor.name;
			let type2 = obj2[i].constructor.name;

			// mismatched types
			if ( type1 != type2 ) {
				console.log( printDots( trail2 ) + '.' + i + ' type: ' + type1 + ' != ' + type2 );
				return false;
			}

			result = result && checkStructure( obj1[i], obj2[i], trail.concat( [obj1] ), trail2.concat( [i] ) );
			
		// a literal
		} else {
			if ( obj1[i] === obj2[i] ) {
				continue;
			} else {

				// mismatched values
				console.log( printDots( trail2 ) + '.' + i + ': ' + obj1[i] + ' != ' + obj2[i] );
				return false;
			}
		}
	}

	// look through obj2 for keys that are not in obj1
	for ( let i in obj2 ) {

		if ( !( i in obj1 ) ) {
			console.log( printDots( trail2 ) + '.' + i + ' missing from obj1' );			
			return false;
		}	
	}

	return result;
}

export function checkSchema( obj: any, schemaName: string ): boolean {
	return true;
}