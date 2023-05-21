export let config: { [key: string]: any } = {
	PRINT: false,
	WRITE_PTR_CLASSNAME: false,
}

export let log: { [key: string]: any } = {
	TRAIL: '',
}

/*
	when trying to reload from JSON, the class name in the __class__ field
	cannot be found  
 */
class MissingConstructorError extends Error {
	constructor( className: string ) {
		super();

		this.name = 'MissingConstructor';
		this.message = 'Missing constructor for ' + className;
	}
}

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

type Dict<Type> = { [key: string]: Type };
type FactoryFunc = () => Object;

/*
	Toaster

	aids in traversing the object tree and reporting errors when they arise
 */
export class Toaster {
	 // list of functions used to instantiate classes
	constructors: Dict<FactoryFunc> = {};
	nameMap: Dict<string> = {}; // mapping of class names if code is obfuscated

	addrIndex: Array<any> = []; // record of objects seen, array index is obj.__id__
	
	// record of whether a pointer was ever created for a given __id__
	// (if not, omit them from the output for clarity and to save space)
	usedAddrs: Array<boolean> = []; 

	outputList: Array<any> = []; // list of objects created (easier to traverse than a tree)
	trail: Array<TrailEntry> = []; // record of where we are in the object tree

	constructor( constructors: Dict<FactoryFunc>, nameMap: Dict<string> ) {
		this.constructors = constructors;
		this.nameMap = nameMap;
	}

	copy( entry: TrailEntry ): Toaster {
		let toaster = new Toaster( this.constructors, this.nameMap );
		toaster.addrIndex = this.addrIndex;
		toaster.usedAddrs = this.usedAddrs;
		toaster.outputList = this.outputList;
		toaster.trail = this.trail.concat( entry );

		return toaster;
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
				throw new Error( 'listToJSON: object lacks __id__' );
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
		} else {
			return null;
		}
	}
}

export function singleToJSON( obj: any,
							  constructors: Dict<FactoryFunc>,
							  nameMap: Dict<string> ): any {
	let list = listToJSON( [obj], constructors, nameMap );

	return list[0];
}

export function listToJSON( list: Array<any>, 
							constructors: Dict<FactoryFunc>,
							nameMap: Dict<string> ): any {
	let output: Array<any> = [];

	log.TRAIL = '';
	let toaster = new Toaster( constructors, nameMap );

	try {
		for ( let i = 0; i < list.length; i++ ) {
			addToIndex( list[i], toaster, true );
		}

		for ( let i = 0; i < list.length; i++ ) {
			try {
				setJSON( output, i, list[i], toaster, true );
				//output[i] = toJSON( list[i], toaster.copy( new TrailEntry( list[i], i ) ), true );

			} catch( ex ) {
				if ( ex instanceof MissingConstructorError ) {
					console.error( ex.message );

				} else if ( ex instanceof BadConversionError ) {
					console.error( ex.message );

				} else {
					throw ex;
				}
			}
		}

		for ( let obj of toaster.outputList ) {
			if ( '__id__' in obj && !( obj['__id__'] in toaster.usedAddrs ) ) {
				delete obj['__id__'];
			}
		}

	} catch( ex ) {
		throw ex;

	} finally {
		toaster.cleanAddrIndex();
	}

	return output;
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
function shouldBePointer( obj: any, toaster: Toaster ): boolean {

	if ( obj instanceof Object && '__id__' in obj ) {
		if ( obj['__id__'] in toaster.addrIndex && obj['__written__'] ) {
			return true;
		}
	}

	// either not a pointer-able object, or needs to be added to addrIndex
	return false;
}

/**
 * Checks whether an object is one of those the Toaster can create
 * 
 * @param {Object} some object
 * @param {Toaster} helper object, used here for its constructor list
 *
 * @throws {MissingConstructorError} if the necessary constructor is not found
 */
function checkConstructor( obj: Object, toaster: Toaster ) {
	if ( obj ) {
		if ( !toaster.getName( obj ) ) {
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
function addToIndex( obj: any, toaster: Toaster, prewritten: boolean=false ): boolean {
	if ( obj instanceof Object ) {
		if ( !( '__id__' in obj ) ) {
			toaster.addrIndex.push( obj );
			obj['__id__'] = toaster.addrIndex.length - 1;
			obj['__written__'] = prewritten;

			return true;

		} else {
			if ( toaster.addrIndex[obj['__id__']] != obj ) {
				throw new Error( 
					'addToIndex: __id__ collision at ' + obj['__id__'] );
			}
		}
	}

	return false;
}

function printVar( trail: Array<TrailEntry>, reading: boolean=false, msg: string='' ) {
	if ( trail.length < 1 ) {
		return;
	}

	let str = '';

	// pad out for depth
	for ( let entry of trail ) {
		str += '  ';
	}

	// variable name or array index
	if ( trail.length > 0 ) {
		str += trail[trail.length - 1].varname + ' ';		
	}

	let obj = trail[trail.length - 1].obj;

	// object type and value
	let type = typeof( obj );
	if ( typeof( obj ) == 'object' && obj ) {
		if ( reading && '__class__' in obj ) {		
			type = obj['__class__'];
		} else {
			type = obj.constructor.name;
		}

	} else {
		if ( typeof( obj ) == 'string' ) {
			str += '\"' + obj + '\"' + ' ';
		} else {
			str += obj + ' ';	
		}
	}

	str += '(' + type + ')';

	// pointers
	if ( typeof( obj ) == 'object' && obj ) {
		if ( reading ) {
			if ( '__pointer__' in obj ) str += ' -> ' + obj['__pointer__'];
			if ( '__id__' in obj ) str += ':' + obj['__id__'];
		} else {
			if ( '__id__' in obj ) str += ':' + obj['__id__'];
		}
	}

	if ( config.PRINT ) console.log( str );
	log.TRAIL += str + msg + '\n';
}

function printTrail( trail: Array<TrailEntry>, reading: boolean=false, loopIndex: number=-1 ) {
	for ( let i = 0; i < trail.length; i++ ) {
		let entry = trail[i];
		let str = '';

		if ( typeof( entry.varname ) == 'string' ) {
			str += '.' + entry.varname;
		} else if ( typeof( entry.varname ) == 'number' ) {
			str += '[' + entry.varname + ']';
		}
		
		let id = '';
		let objType = '';

		if ( entry.obj instanceof Object ) {
			if ( '__id__' in entry.obj ) {
				id = ' id' + entry.obj['__id__'];
			}

			if ( '__pointer__' in entry.obj ) {
				objType += '*';
			}

			if ( reading ) {
				objType += entry.obj['__class__'];
			} else {
				objType += entry.obj.constructor.name;
			}

			str += ' (' + objType + ')' + id;

			if ( '__pointer__' in entry.obj ) {
				str += ' addr=' + entry.obj['__pointer__'];
			}

		} else {
			str += ' literal';
		}

		if ( loopIndex > 0 ) {
			if ( i == loopIndex ) str += ' <-';
			if ( i == trail.length - 1 ) str += ' ->'
		}

		console.log( str );
	}
}

export function setMultiJSON( target: any,
							  varnames: Array<string | number>,
							  obj: any,
							  toaster: Toaster ) {

	for ( let varname of varnames ) {
		if ( !( varname in obj ) ) {
			throw new Error(
				'setMultiJSON(): No key ' + varname + ' in ' + toaster.getName( obj ) );
		}

		setJSON( target, varname, obj[varname], toaster );
	}
}

export function setJSON( target: any, 
						 varname: string | number, 
						 obj: any, 
						 toaster: Toaster, 
						 toplevel: boolean=false ) {

	target[varname] = toJSON( obj, 
							  toaster.copy( new TrailEntry( obj, varname ) ), 
							  toplevel );
}

export function toJSON( obj: any, toaster: Toaster, toplevel: boolean=false ): any {
	printVar( toaster.trail );

	if ( toaster.trail.length > 20 ) {
		printTrail( toaster.trail );
		throw new Error( 'Maximum recursion depth exceeded' );
	}

	if ( obj === null || obj === undefined ) {
		return obj;

	// objects from classes in 'constructors'
	} else if ( !toplevel && shouldBePointer( obj, toaster ) ) {
		return toJSONPointer( obj, toaster );

	} else if ( obj.toJSON ) {
		checkConstructor( obj, toaster );
		addToIndex( obj, toaster );

		let output = {};

		if ( '__id__' in obj ) {
			output = { '__id__': obj['__id__'],
					   '__class__': toaster.getName( obj ) };			
			obj['__written__'] = true;
		}		

		let conv = obj.toJSON( toaster );

		if ( !conv ) {
			throw new BadConversionError( toaster.getName( obj ) );
		}

		output = { ...output, ...conv };

		toaster.outputList.push( output );
		return output;

	} else if ( obj instanceof Object ) {
		checkConstructor( obj, toaster );
		addToIndex( obj, toaster );

		let flat: any = {};
		let className = toaster.getName( obj );

		if ( obj instanceof Array ) {
			flat['__array__'] = [];
		}

		if ( '__id__' in obj ) {
			flat['__id__'] = obj['__id__'];
			obj['__written__'] = true;
		}

		if ( className != 'Object' && className != 'Array' ) {
			flat['__class__'] = className;
		}

		let target = flat;
		if ( obj instanceof Array ) target = flat['__array__'];

		for ( let varname in obj ) {
			if ( varname == '__written__') continue;

			setJSON( target, varname, obj[varname], toaster );
			//target[varname] = toJSON( obj[varname], 
			//						  toaster.copy( new TrailEntry( obj[varname], varname ) ) );			
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
}

export function toJSONPointer( obj: any, toaster: Toaster ): any {
	if ( obj === null || obj === undefined ) {
		return null;

	} else if ( !( '__id__' in obj ) ) {
		addToIndex( obj, toaster, false );
	}

	let output: any = { "__pointer__": obj['__id__'] };

	if ( config.WRITE_PTR_CLASSNAME ) {
		output['__class__'] = toaster.getName( obj );
	}

	toaster.usedAddrs[obj['__id__']] = true;

	return output;
}

export function checkSchema( obj: any, schemaName: string ): boolean {
	return true;
}


function indexOnRead( json: any, obj: any, toaster: Toaster ) {
	// add to id index
	if ( '__id__' in json ) {
		if ( json['__id__'] in toaster.addrIndex ) {
			printTrail( toaster.trail, true );

			let str = toaster.getName( toaster.addrIndex[json['__id__']] ) + ', '
					  toaster.getName( obj );

			throw new Error( 
				'indexOnRead(): __id__ collision at ' + json['__id__'] + ': ' + str );
		}

		toaster.addrIndex[json['__id__']] = obj;
	}	
}

export function fromJSON( json: any, toaster: Toaster ) {
	log.TRAIL = '';

	return fromJSONRecur( json, toaster );
}

function fromJSONRecur( json: any, toaster: Toaster ) {
	printVar( toaster.trail, true )

	if ( toaster.trail.length > 20 ) {
		printTrail( toaster.trail, true );
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
			let type = json['__class__'];

			if ( !( type in toaster.constructors ) ) {
				throw new Error( 'fromJSON: unhandled class ' + type );
			}		

			obj = toaster.constructors[type](); // <-- object created here

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

export function resolveList( list: Array<any>, toaster: Toaster ) {
	log.TRAIL = '';

	for ( let i = 0; i < list.length; i++ ) {
		resolveObject( list[i], toaster.copy( new TrailEntry( list[i], i ) ) );
	}
}

/**
 * replace { __pointer__: addr } JSON objects with real objects
 * 
 * @param {any} a JSON object created with toastpoint
 * @param {Toaster}
 */
function resolveObject( obj: any, toaster: Toaster ) {
	//if (typeof (HTMLElement) === 'function' && obj instanceof HTMLElement) {
    //    return;
    //}

	if ( !obj || typeof( obj ) != 'object' ) return;
	if ( !toaster.getName( obj ) ) {
		printVar( toaster.trail, true, ' no constructor' );
		return;
	}

	printVar( toaster.trail, true );

	// look for the current object in the existing trail (if there
	// are no loops, it shouldn't be there)
	let index = toaster.trail.findIndex( ( x ) => x.obj == obj );

	if ( index >= 0 && index < toaster.trail.length - 1 ) {
		printTrail( toaster.trail, false, index );

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
				printTrail( toaster.trail, false );
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